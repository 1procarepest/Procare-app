-- 2026-11-14. Rep work areas, round 2: a day-by-day booking guide.
-- fr_spots: spots on routes from today to 7 days out (Procare Sync, hourly). No customer details.
-- rep_work_areas() now also returns `days`: for each area and each day from today to 7 days out
-- (no Sundays), up to 3 routes ranked by open spots first, then by how close the route's nearest stop is
-- (miles from the middle of the rep's pins to the middle of that stop's city). Routes with no stops yet
-- (for example Initials routes) show when they have open spots in the area's office.
-- `techs` now covers only the chosen period (who worked near the area then).

begin;

create table if not exists public.fr_spots (
  spot_id        bigint primary key,
  office         text not null,
  route_id       bigint not null,
  date           date,
  start_time     text,
  end_time       text,
  capacity       numeric,
  blocked        boolean not null default false,
  appointment_id bigint,
  synced_at      timestamptz
);
create index if not exists fr_spots_route on public.fr_spots (route_id);
create index if not exists fr_spots_date on public.fr_spots (date);
alter table public.fr_spots enable row level security;   -- read only through security definer functions

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
    select distinct on (d.door_id) m.emp, d.door_id, d.office, d.status, d.latitude, d.longitude, nullif(trim(d.zip), '') as zip,
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
           array_agg(distinct p.zip) filter (where p.zip is not null) as zips,
           mode() within group (order by p.office) as office
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
    select 'period'::text as win,
           case when a.status = 1 then coalesce(a.serviced_by, r.assigned_tech, a.assigned_tech)
                else coalesce(r.assigned_tech, a.assigned_tech) end as tech_fr,
           initcap(trim(c.city)) as city
    from fr_appointments a
    join fr_customers c on c.customer_id = a.customer_id
    left join fr_routes r on r.route_id = a.route_id
    where a.status in (0, 1)
      and a.date between p_from and p_to
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
  -- Booking guide: each route from today to 7 days out (no Sundays), where its stops are and its open spots.
  rdays as materialized (
    select r.route_id, r.office, r.date, r.title, coalesce(r.title, '') ~* 'initial' as is_initial, tm.emp as tech
    from fr_routes r left join techmap tm on tm.fr_id = r.assigned_tech
    where r.date between today and today + 7 and extract(dow from r.date) <> 0
  ),
  rstops as materialized (
    select a.route_id, cm.city, cm.lat, cm.lng, count(*)::int as n
    from fr_appointments a
    join rdays rd on rd.route_id = a.route_id
    join fr_customers c on c.customer_id = a.customer_id
    join city_mid cm on cm.city = initcap(trim(c.city))
    where a.status in (0, 1)
    group by 1, 2, 3, 4
  ),
  ropen as materialized (
    select s.route_id, count(*)::int as open_spots,
           array_agg(case when s.start_time ~ '^\d{1,2}:\d{2}' then to_char(s.start_time::time, 'FMHH12:MI AM') else s.start_time end order by s.start_time) as open_times
    from fr_spots s join rdays rd on rd.route_id = s.route_id
    where coalesce(s.capacity, 1) > 0 and s.appointment_id is null and not s.blocked
    group by 1
  ),
  rjobs as (
    select route_id, sum(n)::int as jobs from rstops group by 1
  ),
  picks as (
    select a.emp as rep, a.city as area, rd.date, rd.route_id, rd.title, rd.is_initial, rd.tech,
           coalesce(o.open_spots, 0) as open_spots, o.open_times, coalesce(j.jobs, 0) as jobs,
           near.miles, near.city as near_city, coalesce(near.close_jobs, 0) as close_jobs
    from areas a
    cross join rdays rd
    left join ropen o on o.route_id = rd.route_id
    left join rjobs j on j.route_id = rd.route_id
    left join lateral (
      select x.city, x.miles, sum(x.n) over ()::int as close_jobs
      from (select s.city, s.n, round((69.0 * sqrt(power(s.lat - a.lat, 2) + power((s.lng - a.lng) * cos(radians(a.lat)), 2)))::numeric, 1) as miles
            from rstops s where s.route_id = rd.route_id) x
      where x.miles <= 6
      order by x.miles limit 1
    ) near on true
    where a.lat is not null
      and (near.miles is not null or (j.jobs is null and rd.office = a.office and o.open_spots > 0))
  ),
  ranked as (
    select p.*, row_number() over (partition by p.rep, p.area, p.date
             order by (p.open_spots > 0) desc, p.miles nulls last, p.open_spots desc) as rk
    from picks p
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
    'days', coalesce((select json_agg(json_build_object(
        'rep', k.rep, 'area', k.area, 'date', k.date, 'route_id', k.route_id, 'route', k.title, 'is_initial', k.is_initial,
        'tech', k.tech, 'first_name', t.first_name, 'last_name', t.last_name, 'photo_url', t.photo_url,
        'open_spots', k.open_spots, 'open_times', k.open_times, 'jobs', k.jobs,
        'miles', k.miles, 'near_city', k.near_city, 'close_jobs', k.close_jobs)
        order by k.date, k.rk)
      from ranked k left join techs t on t.id = k.tech where k.rk <= 3), '[]'::json),
    'spots_loaded', exists (select 1 from fr_spots where date >= today),
    'cities_loaded', exists (select 1 from fr_customers where city is not null)
  ) into result;
  return result;
end;
$$;
revoke all on function public.rep_work_areas(date, date) from public, anon;
grant execute on function public.rep_work_areas(date, date) to authenticated;

commit;
