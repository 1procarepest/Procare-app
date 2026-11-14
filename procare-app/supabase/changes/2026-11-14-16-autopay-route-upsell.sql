-- 2026-11-14. Scorecard round 4:
--   Auto-pay added: credited to the tech who completed a job for that customer the day auto-pay was turned on
--     (from fr_autopay_changes, which the sync has logged since 2026-11-13).
--   Today's route for each tech: last name, service, auto-pay yes/no, whether the job has notes, and upsells.
--   Production is no longer used: FieldRoutes sends -1.00 as the production value of every job.

begin;

-- Whether a job has notes (the note text itself isn't stored). Filled by Procare Sync.
alter table public.fr_appointments add column if not exists has_notes boolean;

-- Short codes for the core services, from the FieldRoutes service type name.
--   GPS general pest · TBS termite bait (incl. Trelona) · TL termite liquid · MOS mosquito · MOSG mosquito green
-- One-time services don't count as having the service.
create or replace function public.service_code(type_name text)
returns text language sql immutable as $$
  select case
    when type_name ilike '%termite bait%' or type_name ilike '%trelona%' then 'TBS'
    when type_name ilike '%termite liquid%' then 'TL'
    when type_name ilike '%mosquito green%' then 'MOSG'
    when type_name ilike '%mosquito%' and type_name not ilike '%one time%' then 'MOS'
    when type_name ilike '%general pest%' and type_name not ilike '%one time%'
         and type_name not ilike '%partial%' and type_name not ilike '%reservice%' then 'GPS'
  end
$$;

-- A tech's route for a day (default: the signed-in person, today). Their own, or someone they manage.
-- Upsells: GPS if no general pest; TBS unless they have TBS or TL; MOS unless they have MOS or MOSG.
drop function if exists public.my_route(uuid, date);
create function public.my_route(p_employee uuid default null, p_day date default null)
returns table (appointment_id bigint, start_time time, end_time time, done boolean, customer text, service text,
               autopay boolean, has_notes boolean, upsell text[])
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := my_id();
  target uuid := coalesce(p_employee, my_id());
  day date := coalesce(p_day, (now() at time zone 'America/New_York')::date);
  ids bigint[];
begin
  if me is null or target is null then return; end if;
  if target <> me and not can_manage(target) and my_rank() < 4 then return; end if;
  select coalesce(array(select v::bigint from jsonb_each_text(e.fr_ids) j(k, v) where v ~ '^\d+$'), '{}')
    into ids from employees e where e.id = target;

  return query
  select a.appointment_id, a.start_time, a.end_time, (a.status = 1),
         coalesce(nullif(trim(c.company_name), ''), c.last_name, '(unknown)'),
         coalesce(t.description, ''),
         coalesce(c.autopay, '') !~* '^(no|0|false|none)?$',
         coalesce(a.has_notes, false),
         array_remove(array[
           case when not coalesce(h.gps, false) then 'GPS' end,
           case when not (coalesce(h.tbs, false) or coalesce(h.tl, false)) then 'TBS' end,
           case when not (coalesce(h.mos, false) or coalesce(h.mosg, false)) then 'MOS' end
         ], null)
  from fr_appointments a
  left join fr_customers c on c.customer_id = a.customer_id
  left join fr_service_types t on t.office = a.office and t.type_id = a.type_id
  left join lateral (
    select bool_or(service_code(s.service_type) = 'GPS') as gps, bool_or(service_code(s.service_type) = 'TBS') as tbs,
           bool_or(service_code(s.service_type) = 'TL') as tl, bool_or(service_code(s.service_type) = 'MOS') as mos,
           bool_or(service_code(s.service_type) = 'MOSG') as mosg
    from fr_subscriptions s where s.customer_id = a.customer_id and s.active
  ) h on true
  where a.date = day and a.employee_id = any(ids)
    and coalesce(a.status, 0) <> -1 and coalesce(a.status_text, '') !~* '(cancel|resched)'
  order by a.start_time nulls last, a.appointment_id;
end $$;
revoke execute on function public.my_route(uuid, date) from public, anon;
grant execute on function public.my_route(uuid, date) to authenticated;

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
  drive_hours numeric, crash integer, following integer, rolling_stops integer, seatbelt integer,
  autopay_added integer
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
  -- Auto-pay turned on: credited to the tech who completed a job for that customer the same day.
  ap as (
    select distinct w.which, ch.customer_id, (ch.changed_at at time zone 'America/New_York')::date as day,
           (select coalesce(nullif(p.serviced_by, 0), p.employee_id) from fr_appointments p
             where p.customer_id = ch.customer_id and p.status = 1
               and p.date = (ch.changed_at at time zone 'America/New_York')::date
             order by p.date_completed desc nulls last, p.appointment_id desc limit 1) as tech_id
    from wins w
    join fr_autopay_changes ch on (ch.changed_at at time zone 'America/New_York')::date between w.s and w.e
    where coalesce(ch.autopay_before, '') ~* '^(no|0|false|none)?$' and coalesce(ch.autopay_after, '') !~* '^(no|0|false|none)?$'
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
         case when t.full_detail then coalesce(ds.seatbelt, 0) end,
         coalesce((select count(*) from ap x where x.which = w.which and x.tech_id = any(t.ids)), 0)::int
  from techs t
  cross join wins w
  left join drv d on d.employee_id = t.id and d.which = w.which
  left join distr ds on ds.employee_id = t.id and ds.which = w.which
  order by t.last_name, t.first_name, w.which;
end $$;

revoke execute on function public.tech_scorecard(text) from public, anon;
grant execute on function public.tech_scorecard(text) to authenticated;

commit;
