-- 2026-11-14. Scorecard speed: the page hit Supabase's statement timeout.
-- Same numbers as before, computed faster:
--   * each tech's FieldRoutes IDs are worked out once (they were being recomputed many times per page)
--   * every total is matched to techs in one pass through an ID map, instead of a lookup per tech per number
--   * the "last regular service before" lookups use the service types table directly (indexed)
--   * dash-cam events are matched by driver or by truck with their own indexes
--   * new indexes on appointment date and customer

begin;

create index if not exists fr_appointments_date on public.fr_appointments (date);
create index if not exists fr_appointments_customer_date on public.fr_appointments (customer_id, date);
create index if not exists fr_appointments_sub_date on public.fr_appointments (subscription_id, date);
create index if not exists samsara_events_time on public.samsara_events (event_time);

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
  with techs as materialized (   -- every active technician (everyone sees the full leaderboard)
    select e.id, e.first_name, e.last_name, e.office, e.photo_url
    from employees e where e.active and e.department = 'technician'
  ),
  idmap as materialized (        -- FieldRoutes ID → technician, worked out once
    select t.id as emp, x.fr_id from techs t cross join lateral unnest(tech_fr_ids(t.id)) as x(fr_id)
  ),
  wins as materialized (
    select 'cur'::text as which, per.cur_start as s, per.cur_end as e
    union all select 'prior', per.prior_start, per.prior_end
  ),
  appts as materialized (        -- jobs that count: not cancelled, and done or already in the past
    select w.which, a.appointment_id, a.subscription_id, a.date, a.is_initial, (a.status = 1) as done,
           reservice_kind(st.description) as kind,
           case when a.status = 1 then coalesce(nullif(a.serviced_by, 0), nullif(a.assigned_tech, 0), rr.assigned_tech)
                else coalesce(nullif(a.assigned_tech, 0), rr.assigned_tech) end as tech_id,
           a.production_value
    from wins w
    join fr_appointments a on a.date between w.s and w.e
    left join fr_routes rr on rr.route_id = a.route_id
    left join fr_service_types st on st.office = a.office and st.type_id = a.type_id
    where coalesce(a.status, 0) <> -1 and coalesce(a.status_text, '') !~* '(cancel|resched)'
      and (a.status = 1 or a.date < today)
  ),
  work as (
    select m.emp, a.which, count(*)::int as sched, count(*) filter (where a.done)::int as serv,
           coalesce(sum(a.production_value) filter (where a.done), 0) as prod
    from appts a join idmap m on m.fr_id = a.tech_id group by 1, 2
  ),
  -- Reservices: charged to the last tech who completed a regular (non-reservice) service on that subscription before it.
  resv as (
    select m.emp, x.which,
           count(*) filter (where x.kind = 'reservice')::int as reservices,
           count(*) filter (where x.kind = 'incomplete')::int as incompletes,
           count(*) filter (where x.kind = 'partial')::int as partials
    from (
      select a.which, a.kind,
             (select nullif(p.serviced_by, 0)
                from fr_appointments p left join fr_service_types pt on pt.office = p.office and pt.type_id = p.type_id
               where p.subscription_id = a.subscription_id and p.status = 1 and p.date <= a.date
                 and p.appointment_id <> a.appointment_id and reservice_kind(pt.description) is null
               order by p.date desc, p.appointment_id desc limit 1) as tech_id
      from appts a where a.kind is not null and a.subscription_id is not null
    ) x join idmap m on m.fr_id = x.tech_id
    group by 1, 2
  ),
  revs as (   -- reviews go to the tech on the reviewed appointment
    select m.emp, x.which, count(*) filter (where x.stars >= coalesce((r->>'star_min')::numeric, 5))::int as stars,
           count(*)::int as reviews, round(avg(x.stars), 1) as rating
    from (
      select w.which, rv.stars, coalesce(nullif(ra.serviced_by, 0), rv.employee_id) as tech_id
      from wins w
      join fr_reviews rv on (rv.review_date at time zone 'America/New_York')::date between w.s and w.e
      left join fr_appointments ra on ra.appointment_id = rv.appointment_id
    ) x join idmap m on m.fr_id = x.tech_id
    group by 1, 2
  ),
  sold as (
    select m.emp, w.which, count(*)::int as sold, coalesce(sum(s.contract_value), 0) as sold_value
    from wins w
    join fr_subscriptions s on (s.date_added at time zone 'America/New_York')::date between w.s and w.e
    join idmap m on m.fr_id = s.sold_by
    group by 1, 2
  ),
  done_sales as (   -- a sale's first service completed: credited to whoever sold it
    select m.emp, x.which, count(*)::int as sales_done, coalesce(sum(x.contract_value), 0) as sales_done_value
    from (select distinct a.which, s.sold_by, s.subscription_id, s.contract_value
          from appts a join fr_subscriptions s on s.subscription_id = a.subscription_id
          where a.done and a.is_initial and s.sold_by > 0) x
    join idmap m on m.fr_id = x.sold_by
    group by 1, 2
  ),
  cx as (   -- one per customer per day per kind; charged to the last tech who serviced it
    select m.emp, x.which, count(*) filter (where x.kind = 'tech')::int as cx_tech,
           count(*) filter (where x.kind = 'billing')::int as cx_billing
    from (
      select distinct on (w.which, s.customer_id, s.date_cancelled, k.kind) w.which, k.kind,
             (select nullif(p.serviced_by, 0)
                from fr_appointments p left join fr_service_types pt on pt.office = p.office and pt.type_id = p.type_id
               where p.subscription_id = s.subscription_id and p.status = 1 and p.date <= s.date_cancelled
                 and reservice_kind(pt.description) is null
               order by p.date desc, p.appointment_id desc limit 1) as tech_id
      from wins w
      join fr_subscriptions s on s.date_cancelled between w.s and w.e
      cross join lateral (
        select case
          when exists (select 1 from jsonb_array_elements_text(r->'cancel_tech_reasons') q where s.cancel_reason ilike '%' || q || '%') then 'tech'
          when exists (select 1 from jsonb_array_elements_text(r->'cancel_billing_reasons') q where s.cancel_reason ilike '%' || q || '%') then 'billing'
        end as kind
      ) k
      where k.kind is not null
    ) x join idmap m on m.fr_id = x.tech_id
    group by 1, 2
  ),
  rt as (   -- completion: jobs on the morning route, and how many of those the same tech finished that day
    select m.emp, w.which,
           count(*) filter (where rs.snap_date < today or done_by.emp = m.emp)::int as routed,
           count(*) filter (where done_by.emp = m.emp)::int as route_done
    from wins w
    join route_snapshots rs on rs.snap_date between w.s and w.e
    join idmap m on m.fr_id = rs.employee_id
    left join fr_appointments a on a.appointment_id = rs.appointment_id
    left join idmap done_by on done_by.fr_id = (case when a.status = 1 and a.date = rs.snap_date then nullif(a.serviced_by, 0) end)
                           and done_by.emp = m.emp
    group by 1, 2
  ),
  ap as (   -- auto-pay turned on: the tech who completed a job for that customer that same day
    select m.emp, x.which, count(*)::int as autopay_added
    from (
      select distinct w.which, ch.customer_id, (ch.changed_at at time zone 'America/New_York')::date as day,
             (select nullif(p.serviced_by, 0) from fr_appointments p
               where p.customer_id = ch.customer_id and p.status = 1
                 and p.date = (ch.changed_at at time zone 'America/New_York')::date
               order by p.date_completed desc nulls last, p.appointment_id desc limit 1) as tech_id
      from wins w
      join fr_autopay_changes ch on (ch.changed_at at time zone 'America/New_York')::date between w.s and w.e
      where coalesce(ch.autopay_before, '') ~* '^(no|0|false|none)?$' and coalesce(ch.autopay_after, '') !~* '^(no|0|false|none)?$'
    ) x join idmap m on m.fr_id = x.tech_id
    group by 1, 2
  ),
  drv as (
    select ts.employee_id as emp, split_part(ts.window_key, ':', 2) as which, ts.source, ts.score, ts.miles, ts.speed_pct,
           ts.harsh_brake, ts.harsh_accel, ts.harsh_turn, ts.drive_hours, ts.crash
    from tech_safety_scores ts where split_part(ts.window_key, ':', 1) = period
  ),
  evs as (   -- dash-cam events by driver (once a tech is a Samsara driver) or by truck
    select tv.employee_id as emp, w.which, ev.labels
    from tech_vehicles tv cross join wins w
    join samsara_events ev on ev.driver_id = tv.driver_id
     and ev.event_time >= (w.s::timestamp at time zone 'America/New_York') and ev.event_time < ((w.e + 1)::timestamp at time zone 'America/New_York')
    where tv.driver_id is not null
    union all
    select tv.employee_id, w.which, ev.labels
    from tech_vehicles tv cross join wins w
    join samsara_events ev on ev.vehicle_id = tv.vehicle_id
     and ev.event_time >= (w.s::timestamp at time zone 'America/New_York') and ev.event_time < ((w.e + 1)::timestamp at time zone 'America/New_York')
    where tv.driver_id is null and tv.vehicle_id is not null
  ),
  distr as (
    select emp, which,
           count(*) filter (where labels && array['mobileUsage', 'edgeDistractedDriving', 'genericDistraction'])::int as distracted,
           count(*) filter (where labels && array['followingDistance', 'followingDistanceSevere', 'followingDistanceModerate', 'genericTailgating'])::int as following,
           count(*) filter (where labels && array['rollingStop'])::int as rolling_stops,
           count(*) filter (where labels && array['noSeatbelt'])::int as seatbelt
    from evs group by 1, 2
  )
  select t.id, t.first_name, t.last_name, t.office, t.photo_url, true, w.which,
         coalesce(wk.sched, 0), coalesce(wk.serv, 0), round(coalesce(wk.prod, 0), 2),
         coalesce(rv.stars, 0), coalesce(rv.reviews, 0), rv.rating,
         coalesce(rs.reservices, 0), coalesce(rs.incompletes, 0), coalesce(rs.partials, 0),
         coalesce(sd.sold, 0), coalesce(ds.sales_done, 0), coalesce(c.cx_tech, 0), coalesce(c.cx_billing, 0),
         coalesce(ro.routed, 0), coalesce(ro.route_done, 0),
         round(coalesce(sd.sold_value, 0), 2), round(coalesce(ds.sales_done_value, 0), 2),
         d.source, d.score, d.miles, coalesce(di.distracted, 0), d.speed_pct,
         d.harsh_brake, d.harsh_accel, d.harsh_turn,
         d.drive_hours, d.crash, coalesce(di.following, 0), coalesce(di.rolling_stops, 0), coalesce(di.seatbelt, 0),
         coalesce(ap.autopay_added, 0)
  from techs t
  cross join wins w
  left join work wk       on wk.emp = t.id and wk.which = w.which
  left join revs rv       on rv.emp = t.id and rv.which = w.which
  left join resv rs       on rs.emp = t.id and rs.which = w.which
  left join sold sd       on sd.emp = t.id and sd.which = w.which
  left join done_sales ds on ds.emp = t.id and ds.which = w.which
  left join cx c          on c.emp = t.id and c.which = w.which
  left join rt ro         on ro.emp = t.id and ro.which = w.which
  left join ap            on ap.emp = t.id and ap.which = w.which
  left join drv d         on d.emp = t.id and d.which = w.which
  left join distr di      on di.emp = t.id and di.which = w.which
  order by t.last_name, t.first_name, w.which;
end $$;

revoke execute on function public.tech_scorecard(text) from public, anon;
grant execute on function public.tech_scorecard(text) to authenticated;

commit;
