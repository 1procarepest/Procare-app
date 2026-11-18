-- 2026-11-18 (change 53). Rep Cards: the table at the bottom of each card follows the period picked at the top,
-- and each card shows the city of the rep's last 5 pins.
--
-- rep_card_extras(p_grain, p_to) returns jsonb:
--   history  [{emp, at, hours, doors, convos, info, services}]
--            p_grain 'day':   the 7 days ending p_to (a running week)
--            p_grain 'month': every month with activity, through p_to's month (this year and earlier years)
--            p_grain 'year':  every year with activity, through p_to's year
--            p_grain 'week':  no history (the card keeps rep_cards' 52 weeks), cities only
--   cities   [{emp, cities: ['Decatur', 'Tucker']}]  the cities of the rep's last 5 pins up to p_to, most recent first
-- Counting matches rep_cards: convos = outcomes 1–4, info = doors with a name/phone/email, services = recurring core
-- sales not cancelled before the first service, hours = time between a rep's doors and sales each day, leaving out
-- gaps over an hour. Saved 5 minutes in rpc_cache like the other heavy page functions.
begin;

create or replace function public.rep_card_extras_calc(p_grain text, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  lo_day date;
  lo timestamptz;
  hi timestamptz := ((p_to + 1)::timestamp) at time zone 'America/New_York';
  result jsonb;
begin
  lo_day := case p_grain when 'day' then p_to - 6 when 'week' then p_to + 1 else date '2015-01-01' end;   -- week: cities only
  lo := (lo_day::timestamp) at time zone 'America/New_York';

  with reps as materialized (
    select e.id from employees e where e.department = 'sales'
  ),
  idmap as materialized (
    select r.id as emp, x.fr_id::bigint as fr_id from reps r cross join lateral unnest(tech_fr_ids(r.id)) as x(fr_id)
  ),
  doors as materialized (
    select m.emp, (d.time_created at time zone 'America/New_York') as t, d.status, d.has_info
    from idmap m join fr_doors d on d.employee_id = m.fr_id
    where d.time_created >= lo and d.time_created < hi
  ),
  sales as materialized (
    select m.emp, (s.date_added at time zone 'America/New_York') as t, (s.initial_status_text = 'Cancelled') as cx
    from idmap m join fr_subscriptions s on s.sold_by = m.fr_id
    where s.date_added >= lo and s.date_added < hi
      and coalesce(s.frequency, 0) <> 0
      and coalesce(s.initial_appointment_id, 0) <> 0
      and s.initial_status_text in ('Completed', 'Pending', 'No Show', 'Cancelled')
      and s.service_type in ('General Pest Service', 'Termite Baiting System Service', 'Mosquito Service', 'Mosquito Green Treatment')
  ),
  ev as (select emp, t from doors union all select emp, t from sales),
  rep_day as (
    select emp, day, coalesce(sum(gap) filter (where gap <= 60), 0) / 60.0 as hrs
    from (select emp, t::date as day, extract(epoch from t - lag(t) over (partition by emp, t::date order by t)) / 60 as gap from ev) g
    group by emp, day
  ),
  dagg as (
    select emp, case p_grain when 'month' then date_trunc('month', t)::date when 'year' then date_trunc('year', t)::date else t::date end as at,
           count(*)::int as doors, count(*) filter (where status between 1 and 4)::int as convos,
           count(*) filter (where has_info)::int as info
    from doors group by 1, 2
  ),
  sagg as (
    select emp, case p_grain when 'month' then date_trunc('month', t)::date when 'year' then date_trunc('year', t)::date else t::date end as at,
           count(*) filter (where not cx)::int as services
    from sales group by 1, 2
  ),
  hagg as (
    select emp, case p_grain when 'month' then date_trunc('month', day)::date when 'year' then date_trunc('year', day)::date else day end as at,
           round(sum(hrs), 2) as hours
    from rep_day group by 1, 2
  ),
  keys as (select emp, at from dagg union select emp, at from sagg union select emp, at from hagg),
  last_pins as (
    select emp, city, rn from (
      select m.emp, nullif(trim(d.city), '') as city,
             row_number() over (partition by m.emp order by d.time_created desc) as rn
      from idmap m cross join lateral (   -- uses fr_doors_rep_time: only the newest 5 per FieldRoutes ID
        select x.city, x.time_created from fr_doors x
        where x.employee_id = m.fr_id and x.time_created < hi order by x.time_created desc limit 5) d
    ) z where rn <= 5
  )
  select jsonb_build_object(
    'grain', p_grain, 'to', p_to,
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
        'emp', k.emp, 'at', k.at,
        'hours', coalesce(h.hours, 0), 'doors', coalesce(d.doors, 0), 'convos', coalesce(d.convos, 0),
        'info', coalesce(d.info, 0), 'services', coalesce(s.services, 0)) order by k.emp, k.at), '[]')
      from keys k
      left join dagg d on d.emp = k.emp and d.at = k.at
      left join sagg s on s.emp = k.emp and s.at = k.at
      left join hagg h on h.emp = k.emp and h.at = k.at),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('emp', emp, 'cities', cities)), '[]') from (
        select emp, jsonb_agg(city order by first_rn) as cities from (
          select emp, city, min(rn) as first_rn from last_pins where city is not null group by emp, city
        ) c group by emp) y)
  ) into result;
  return result;
end $$;
revoke all on function public.rep_card_extras_calc(text, date) from public, anon, authenticated;

create or replace function public.rep_card_extras(p_grain text, p_to date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  k text := coalesce(p_grain, '') || '|' || coalesce(p_to::text, '');
  d jsonb;
begin
  if my_id() is null or p_to is null or p_grain not in ('day', 'week', 'month', 'year') then return null; end if;
  d := rpc_cache_get('rep_card_extras', k);
  if d is null then
    d := rep_card_extras_calc(p_grain, p_to);
    perform rpc_cache_put('rep_card_extras', k, d);
  end if;
  return d;
end $$;
revoke all on function public.rep_card_extras(text, date) from public, anon;
grant execute on function public.rep_card_extras(text, date) to authenticated;

commit;
