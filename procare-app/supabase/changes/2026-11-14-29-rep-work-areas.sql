-- 2026-11-14. Rep work areas (/reps?tab=areas): where each sales rep has been knocking doors,
-- and which technicians are scheduled in or near those areas.
--
-- fr_customers gets city and zip (no street address). Procare Sync fills them on its next
-- full refresh of active customers (7 AM and 1 PM), or right away with fillCustomerCities.
--
-- rep_work_areas(p_from, p_to) returns json { areas, techs, cities_loaded }:
--   areas  one per rep per city with 5+ pins between p_from and p_to (Eastern dates).
--          pins, conversations (outcomes 1-4), sales (outcome 3), days knocked, first/last pin,
--          the zips worked, and the middle of the pins (lat/lng).
--   techs  one per area per tech per window: 'period' (p_from..p_to) and 'next' (the 7 days after today).
--          Stops = pending or completed jobs at customers in the same city, or in a city whose
--          middle is within 6 miles of the area's middle. A city's middle comes from all door pins there.
-- Only the President, C-suite and sales managers can call it.

begin;

alter table public.fr_customers add column if not exists city text;
alter table public.fr_customers add column if not exists zip text;

create or replace function public.can_see_rep_areas()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e
                 where e.id = my_id() and e.active
                   and (e.level in ('c_suite', 'president') or (e.department = 'sales' and e.level = 'manager')))
$$;
revoke all on function public.can_see_rep_areas() from public, anon;
grant execute on function public.can_see_rep_areas() to authenticated;

drop function if exists public.rep_work_areas(date, date);
create function public.rep_work_areas(p_from date, p_to date)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  lo timestamptz;
  hi timestamptz;
  result json;
begin
  if not can_see_rep_areas() or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then return null; end if;
  lo := (p_from::timestamp) at time zone 'America/New_York';
  hi := ((p_to + 1)::timestamp) at time zone 'America/New_York';

  with reps as materialized (
    select e.id, e.first_name, e.last_name, e.office, e.photo_url from employees e where e.department = 'sales'
  ),
  repmap as materialized (
    select r.id as emp, x.fr_id::bigint as fr_id from reps r cross join lateral unnest(tech_fr_ids(r.id)) as x(fr_id)
  ),
  pins as materialized (
    select distinct on (d.door_id) m.emp, d.door_id, d.status, d.latitude, d.longitude, nullif(trim(d.zip), '') as zip,
           coalesce(initcap(nullif(trim(d.city), '')), 'Zip ' || nullif(trim(d.zip), '')) as city,
           (d.time_created at time zone 'America/New_York') as t
    from repmap m join fr_doors d on d.employee_id = m.fr_id
    where d.time_created >= lo and d.time_created < hi
  ),
  areas as materialized (
    select p.emp, p.city, count(*)::int as pins,
           count(*) filter (where p.status between 1 and 4)::int as convos,
           count(*) filter (where p.status = 3)::int as sales,
           count(distinct p.t::date)::int as days,
           min(p.t) as first_pin, max(p.t) as last_pin,
           avg(p.latitude) filter (where p.latitude between 30 and 36) as lat,
           avg(p.longitude) filter (where p.longitude between -86 and -80) as lng,
           array_agg(distinct p.zip) filter (where p.zip is not null) as zips
    from pins p where p.city is not null
    group by p.emp, p.city having count(*) >= 5
  ),
  city_mid as materialized (
    select initcap(trim(d.city)) as city, avg(d.latitude) as lat, avg(d.longitude) as lng
    from fr_doors d
    where nullif(trim(d.city), '') is not null and d.latitude between 30 and 36 and d.longitude between -86 and -80
    group by 1
  ),
  techs as materialized (
    select e.id, e.first_name, e.last_name, e.photo_url from employees e where e.department = 'technician'
  ),
  techmap as materialized (
    select t.id as emp, x.fr_id::bigint as fr_id from techs t cross join lateral unnest(tech_fr_ids(t.id)) as x(fr_id)
  ),
  jobs as materialized (
    select case when a.date between p_from and p_to then 'period' else 'next' end as win,
           case when a.status = 1 then coalesce(a.serviced_by, r.assigned_tech, a.assigned_tech)
                else coalesce(r.assigned_tech, a.assigned_tech) end as tech_fr,
           initcap(trim(c.city)) as city
    from fr_appointments a
    join fr_customers c on c.customer_id = a.customer_id
    left join fr_routes r on r.route_id = a.route_id
    where a.status in (0, 1)
      and ((a.date between p_from and p_to) or (a.date > today and a.date <= today + 7))
      and nullif(trim(c.city), '') is not null
  ),
  stops as materialized (
    select j.win, tm.emp, j.city, count(*)::int as n
    from jobs j join techmap tm on tm.fr_id = j.tech_fr
    group by 1, 2, 3
  ),
  near as (
    select a.emp as rep, a.city as area, s.win, s.emp as tech, s.city,
           case when s.city = a.city then 0
                else round((69.0 * sqrt(power(cm.lat - a.lat, 2) + power((cm.lng - a.lng) * cos(radians(a.lat)), 2)))::numeric, 1) end as miles,
           s.n
    from areas a
    join stops s on true
    left join city_mid cm on cm.city = s.city
    where s.city = a.city
       or (a.lat is not null and cm.lat is not null
           and 69.0 * sqrt(power(cm.lat - a.lat, 2) + power((cm.lng - a.lng) * cos(radians(a.lat)), 2)) <= 6)
  ),
  tech_rows as (
    select n.rep, n.area, n.win, n.tech, t.first_name, t.last_name, t.photo_url,
           sum(n.n)::int as stops,
           sum(n.n) filter (where n.miles = 0)::int as in_city,
           json_agg(json_build_object('city', n.city, 'miles', n.miles, 'stops', n.n) order by n.miles, n.city) as cities
    from near n join techs t on t.id = n.tech
    group by n.rep, n.area, n.win, n.tech, t.first_name, t.last_name, t.photo_url
  )
  select json_build_object(
    'areas', coalesce((select json_agg(json_build_object(
        'rep', a.emp, 'first_name', r.first_name, 'last_name', r.last_name, 'home_office', r.office, 'photo_url', r.photo_url,
        'city', a.city, 'pins', a.pins, 'convos', a.convos, 'sales', a.sales, 'days', a.days,
        'first_pin', a.first_pin, 'last_pin', a.last_pin, 'zips', a.zips, 'lat', a.lat, 'lng', a.lng)
        order by r.first_name, r.last_name, a.pins desc)
      from areas a join reps r on r.id = a.emp), '[]'::json),
    'techs', coalesce((select json_agg(json_build_object(
        'rep', x.rep, 'area', x.area, 'win', x.win, 'tech', x.tech, 'first_name', x.first_name, 'last_name', x.last_name,
        'photo_url', x.photo_url, 'stops', x.stops, 'in_city', coalesce(x.in_city, 0), 'cities', x.cities)
        order by x.stops desc)
      from tech_rows x), '[]'::json),
    'cities_loaded', exists (select 1 from fr_customers where city is not null)
  ) into result;
  return result;
end;
$$;
revoke all on function public.rep_work_areas(date, date) from public, anon;
grant execute on function public.rep_work_areas(date, date) to authenticated;

commit;
