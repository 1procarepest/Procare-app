-- 2026-11-14. Scorecard round 3:
--   A "Today" period (compared with the same day last week).
--   Driving detail for the breakdown: drive hours, crashes, following distance, rolling stops, seat belt.
--   Technician photos from FieldRoutes for people who don't have one.
--   fieldroutes_missing_email(): people active in FieldRoutes who can't be added to the app without an email.

begin;

create or replace function public.scorecard_period(p_period text)
returns table (cur_start date, cur_end date, prior_start date, prior_end date, scale numeric, in_progress boolean)
language plpgsql stable as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  wk date := today - (extract(isodow from today)::int - 1);
  mo date := date_trunc('month', today)::date;
  lmo date := (date_trunc('month', today) - interval '1 month')::date;
  yr date := date_trunc('year', today)::date;
  avg_month numeric := 30.4375;
begin
  if p_period = 'today' then
    return query select today, today, today - 7, today - 7, 1 / avg_month, true;
  elsif p_period = 'thisWeek' then
    return query select wk, today, wk - 7, wk - 7 + (today - wk), (today - wk + 1) / avg_month, true;
  elsif p_period = 'lastWeek' then
    return query select wk - 7, wk - 1, wk - 14, wk - 8, 7 / avg_month, false;
  elsif p_period = 'lastMonth' then
    return query select lmo, mo - 1, (lmo - interval '1 month')::date, lmo - 1, (mo - lmo) / avg_month, false;
  elsif p_period = 'thisYear' then
    return query select yr, today, (yr - interval '1 year')::date, (yr - interval '1 year')::date + (today - yr), (today - yr + 1) / avg_month, true;
  else  -- thisMonth
    return query select mo, today, lmo, least(lmo + (today - mo), mo - 1), (today - mo + 1) / avg_month, true;
  end if;
end $$;

-- ---------- The scorecard ----------
-- Two rows per active technician (which = 'cur' and 'prior'). Every signed-in employee sees every
-- column for every tech, like the old scorecard (user decision 2026-11-14); full_detail is kept for later.
drop function if exists public.tech_scorecard(text);
create function public.tech_scorecard(p_period text default 'thisMonth')
returns table (
  employee_id uuid, first_name text, last_name text, office text, photo_url text, full_detail boolean, which text,
  sched integer, serv integer, prod numeric, stars integer, reviews integer, rating numeric,
  reservices integer, incompletes integer, partials integer,
  sold integer, sales_done integer, cx_tech integer, cx_billing integer,
  routed integer, route_done integer, sold_value numeric, sales_done_value numeric,
  drive_source text, drive_score integer, drive_miles integer, distracted integer, speed_pct numeric,
  harsh_brake integer, harsh_accel integer, harsh_turn integer,
  drive_hours numeric, crash integer, following integer, rolling_stops integer, seatbelt integer
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  per record;
  r jsonb;
  today date := (now() at time zone 'America/New_York')::date;
  me uuid := my_id();
  period text := case when p_period in ('today', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisYear') then p_period else 'thisMonth' end;
begin
  if me is null then return; end if;
  select * into per from scorecard_period(period);
  select rules into r from scorecard_rules where id = 1;

  return query
  with techs as (
    select e.id, e.first_name, e.last_name, e.office, e.photo_url,
           true as full_detail,
           coalesce(array(select v::bigint from jsonb_each_text(e.fr_ids) j(k, v) where v ~ '^\d+$'), '{}') as ids
    from employees e
    where e.active and e.department = 'technician'
  ),
  wins as (
    select 'cur'::text as which, per.cur_start as s, per.cur_end as e
    union all select 'prior', per.prior_start, per.prior_end
  ),
  types as (select t.office, t.type_id, reservice_kind(t.description) as kind from fr_service_types t),
  appts as (   -- appointments that count: not cancelled, and done or already in the past
    select a.*, w.which, (a.status = 1) as done, ty.kind,
           case when a.status = 1 then coalesce(nullif(a.serviced_by, 0), a.employee_id) else a.employee_id end as tech_id
    from wins w
    join fr_appointments a on a.date between w.s and w.e
    left join types ty on ty.office = a.office and ty.type_id = a.type_id
    where coalesce(a.status, 0) <> -1 and coalesce(a.status_text, '') !~* '(cancel|resched)'
      and (a.status = 1 or a.date < today)
  ),
  work as (
    select a.which, a.tech_id, count(*)::int as sched, count(*) filter (where a.done)::int as serv,
           coalesce(sum(a.production_value) filter (where a.done), 0) as prod
    from appts a group by 1, 2
  ),
  -- Reservices: charged to the last tech who completed a regular service on that subscription before it.
  resv as (
    select a.which, a.kind,
           (select coalesce(nullif(p.serviced_by, 0), p.employee_id)
              from fr_appointments p left join types pt on pt.office = p.office and pt.type_id = p.type_id
             where p.subscription_id = a.subscription_id and p.status = 1 and p.date <= a.date
               and p.appointment_id <> a.appointment_id and pt.kind is null
             order by p.date desc, p.appointment_id desc limit 1) as tech_id
    from appts a where a.kind is not null and a.subscription_id is not null
  ),
  resv_n as (
    select which, tech_id,
           count(*) filter (where kind = 'reservice')::int as reservices,
           count(*) filter (where kind = 'incomplete')::int as incompletes,
           count(*) filter (where kind = 'partial')::int as partials
    from resv where tech_id is not null group by 1, 2
  ),
  revs as (   -- reviews go to the tech on the reviewed appointment
    select w.which, coalesce(nullif(coalesce(nullif(ra.serviced_by, 0), ra.employee_id), 0), rv.employee_id) as tech_id,
           count(*) filter (where rv.stars >= coalesce((r->>'star_min')::numeric, 5))::int as stars,
           count(*)::int as reviews, round(avg(rv.stars), 1) as rating
    from wins w
    join fr_reviews rv on (rv.review_date at time zone 'America/New_York')::date between w.s and w.e
    left join fr_appointments ra on ra.appointment_id = rv.appointment_id
    group by 1, 2
  ),
  sold as (
    select w.which, s.sold_by as tech_id, count(*)::int as sold, coalesce(sum(s.contract_value), 0) as sold_value
    from wins w join fr_subscriptions s on (s.date_added at time zone 'America/New_York')::date between w.s and w.e
    where s.sold_by > 0 group by 1, 2
  ),
  done_sales as (   -- a sale's first service completed: credited to whoever sold it
    select x.which, x.tech_id, count(*)::int as sales_done, coalesce(sum(x.contract_value), 0) as sales_done_value
    from (select distinct a.which, s.sold_by as tech_id, s.subscription_id, s.contract_value
          from appts a join fr_subscriptions s on s.subscription_id = a.subscription_id
          where a.done and a.is_initial and s.sold_by > 0) x
    group by 1, 2
  ),
  -- Completion: jobs on the tech's route when the morning snapshot was taken, and how many of those
  -- the same tech completed that same day. Today's unfinished jobs don't count yet.
  rt as (   -- done_by = who completed it that same day (null = not completed that day)
    select w.which, rs.employee_id as routed_to, (rs.snap_date < today) as past,
           case when a.status = 1 and a.date = rs.snap_date then coalesce(nullif(a.serviced_by, 0), a.employee_id) end as done_by,
           count(*)::int as n
    from wins w
    join route_snapshots rs on rs.snap_date between w.s and w.e
    left join fr_appointments a on a.appointment_id = rs.appointment_id
    group by 1, 2, 3, 4
  ),
  cx as (   -- one per customer per day per kind; charged to the last tech who serviced it
    select distinct on (w.which, s.customer_id, s.date_cancelled, k.kind) w.which, k.kind,
           (select coalesce(nullif(p.serviced_by, 0), p.employee_id)
              from fr_appointments p left join types pt on pt.office = p.office and pt.type_id = p.type_id
             where p.subscription_id = s.subscription_id and p.status = 1 and p.date <= s.date_cancelled and pt.kind is null
             order by p.date desc, p.appointment_id desc limit 1) as tech_id
    from wins w
    join fr_subscriptions s on s.date_cancelled between w.s and w.e
    cross join lateral (
      select case
        when exists (select 1 from jsonb_array_elements_text(r->'cancel_tech_reasons') x
                     where s.cancel_reason ilike '%' || x || '%') then 'tech'
        when exists (select 1 from jsonb_array_elements_text(r->'cancel_billing_reasons') x
                     where s.cancel_reason ilike '%' || x || '%') then 'billing'
      end as kind
    ) k
    where k.kind is not null
  ),
  cx_n as (
    select which, tech_id, count(*) filter (where kind = 'tech')::int as cx_tech,
           count(*) filter (where kind = 'billing')::int as cx_billing
    from cx where tech_id is not null group by 1, 2
  ),
  links as (select tv.employee_id, tv.driver_id, tv.vehicle_id from tech_vehicles tv),
  drv as (
    select ts.employee_id, split_part(ts.window_key, ':', 2) as which, ts.source, ts.score, ts.miles, ts.speed_pct,
           ts.harsh_brake, ts.harsh_accel, ts.harsh_turn, ts.drive_hours, ts.crash
    from tech_safety_scores ts where split_part(ts.window_key, ':', 1) = period
  ),
  distr as (   -- dash-cam events by kind (one event can carry several labels)
    select w.which, l.employee_id,
           count(*) filter (where ev.labels && array['mobileUsage', 'edgeDistractedDriving', 'genericDistraction'])::int as distracted,
           count(*) filter (where ev.labels && array['followingDistance', 'followingDistanceSevere', 'followingDistanceModerate', 'genericTailgating'])::int as following,
           count(*) filter (where ev.labels && array['rollingStop'])::int as rolling_stops,
           count(*) filter (where ev.labels && array['noSeatbelt'])::int as seatbelt
    from wins w cross join links l
    join samsara_events ev on ev.event_time >= (w.s::timestamp at time zone 'America/New_York')
                          and ev.event_time < ((w.e + 1)::timestamp at time zone 'America/New_York')
                          and (case when l.driver_id is not null then ev.driver_id = l.driver_id else ev.vehicle_id = l.vehicle_id end)
    group by 1, 2
  )
  select t.id, t.first_name, t.last_name, t.office, t.photo_url, t.full_detail, w.which,
         coalesce((select sum(x.sched) from work x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int,
         coalesce((select sum(x.serv)  from work x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int,
         round(coalesce((select sum(x.prod) from work x where x.which = w.which and x.tech_id = any(t.ids)), 0), 2),
         coalesce((select sum(x.stars) from revs x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int,
         coalesce((select sum(x.reviews) from revs x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int,
         (select round(sum(x.rating * x.reviews) / nullif(sum(x.reviews), 0), 1) from revs x where x.which = w.which and x.tech_id = any(t.ids)),
         case when t.full_detail then coalesce((select sum(x.reservices)  from resv_n x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int end,
         case when t.full_detail then coalesce((select sum(x.incompletes) from resv_n x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int end,
         case when t.full_detail then coalesce((select sum(x.partials)    from resv_n x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int end,
         case when t.full_detail then coalesce((select sum(x.sold)       from sold x  where x.which = w.which and x.tech_id = any(t.ids)), 0)::int end,
         case when t.full_detail then coalesce((select sum(x.sales_done) from done_sales x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int end,
         case when t.full_detail then coalesce((select sum(x.cx_tech)    from cx_n x  where x.which = w.which and x.tech_id = any(t.ids)), 0)::int end,
         case when t.full_detail then coalesce((select sum(x.cx_billing) from cx_n x  where x.which = w.which and x.tech_id = any(t.ids)), 0)::int end,
         coalesce((select sum(x.n) from rt x where x.which = w.which and x.routed_to = any(t.ids)
                     and (x.past or x.done_by = any(t.ids))), 0)::int,
         coalesce((select sum(x.n) from rt x where x.which = w.which and x.routed_to = any(t.ids)
                     and x.done_by = any(t.ids)), 0)::int,
         case when t.full_detail then round(coalesce((select sum(x.sold_value) from sold x where x.which = w.which and x.tech_id = any(t.ids)), 0), 2) end,
         case when t.full_detail then round(coalesce((select sum(x.sales_done_value) from done_sales x where x.which = w.which and x.tech_id = any(t.ids)), 0), 2) end,
         case when t.full_detail then d.source end,
         case when t.full_detail then d.score end,
         case when t.full_detail then d.miles end,
         case when t.full_detail then coalesce(ds.distracted, 0) end,
         case when t.full_detail then d.speed_pct end,
         case when t.full_detail then d.harsh_brake end,
         case when t.full_detail then d.harsh_accel end,
         case when t.full_detail then d.harsh_turn end,
         case when t.full_detail then d.drive_hours end,
         case when t.full_detail then d.crash end,
         case when t.full_detail then coalesce(ds.following, 0) end,
         case when t.full_detail then coalesce(ds.rolling_stops, 0) end,
         case when t.full_detail then coalesce(ds.seatbelt, 0) end
  from techs t
  cross join wins w
  left join drv d on d.employee_id = t.id and d.which = w.which
  left join distr ds on ds.employee_id = t.id and ds.which = w.which
  order by t.last_name, t.first_name, w.which;
end $$;

revoke execute on function public.tech_scorecard(text) from public, anon;
grant execute on function public.tech_scorecard(text) to authenticated;

-- Photos: FieldRoutes keeps each employee's picture as a file name on its image server.
-- Fill in anyone without a photo (from an active FieldRoutes record first).
update public.employees e
set photo_url = 'https://d282x1mqo546ey.cloudfront.net/' || p.pic
from (
  select distinct on (e2.id) e2.id, f.pic
  from public.employees e2
  join public.fr_employees f on f.employee_id in (select v::bigint from jsonb_each_text(e2.fr_ids) j(k, v) where v ~ '^\d+$')
  where coalesce(f.pic, '') <> ''
  order by e2.id, f.active desc nulls last, f.synced_at desc
) p
where p.id = e.id and coalesce(e.photo_url, '') = '';

-- Leads and up: FieldRoutes people who are active but have no email, so they can't be added to the app.
-- System and lead-intake accounts are left out.
create or replace function public.fieldroutes_missing_email()
returns table (name text, offices text, fr_ids text)
language sql stable security definer set search_path = public as $$
  select trim(regexp_replace(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, ''), '\s+', ' ', 'g')) as name,
         string_agg(distinct f.office, ', ') as offices,
         string_agg(f.employee_id::text, ', ' order by f.employee_id) as fr_ids
  from fr_employees f
  where my_rank() >= 2 and f.active and coalesce(trim(f.email), '') = ''
    and (coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')) !~* '(fr-system|system admin|buy online|d2d lead|fieldroutes)'
    and not exists (select 1 from employees e, jsonb_each_text(e.fr_ids) j(k, v) where v = f.employee_id::text)
  group by 1
  order by 1
$$;
revoke execute on function public.fieldroutes_missing_email() from public, anon;
grant execute on function public.fieldroutes_missing_email() to authenticated;

commit;
