-- 2026-11-15-42 office KPI competitions: offices compete on rates, by place or by goal.
-- KPIs (same rules as the Operations card), per office:
--   sales    = new core sales in the period per 100 recurring accounts (accounts at the start)
--   autopay  = % of recurring accounts on valid auto-pay (as of the end)
--   ar       = % of accounts receivable 30+ days past due (as of the end; lower is better)
--   pool     = past-due jobs not on the schedule, as % of recurring accounts (as of the end; lower is better)
--   cancel   = core cancels in the period ÷ recurring accounts at the start (lower is better)
-- AR, auto-pay, accounts and the job pool are "right now" numbers, so office_kpi_days keeps a copy each
-- morning (saved by snapshot_routes, which Procare Sync already runs once a day after 7 AM).
-- competitions.style gets 'kpi'; its settings live in competitions.points.kpis.

begin;

create table if not exists public.office_kpi_days (
  day       date not null,                 -- saved that morning (= end of the day before)
  office    text not null,
  accounts  integer not null default 0,    -- recurring accounts
  ap_valid  integer not null default 0,    -- of those, on valid auto-pay
  ar        numeric not null default 0,    -- total AR
  ar_past   numeric not null default 0,    -- AR 30+ days past due
  pool_past integer not null default 0,    -- past-due jobs not on the schedule
  saved_at  timestamptz not null default now(),
  primary key (day, office)
);
alter table public.office_kpi_days enable row level security;
drop policy if exists office_kpi_days_read on public.office_kpi_days;
create policy office_kpi_days_read on public.office_kpi_days for select to authenticated using (can_see_ops());

-- Save (or refresh) today's copy of each office's numbers. Same math as ops_snapshot().
create or replace function public.save_office_kpis()
returns integer language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  next_end date := (date_trunc('month', today) + interval '2 months - 1 day')::date;
  n integer;
begin
  with ar as (
    select office, coalesce(sum(balance) filter (where balance > 0), 0) as ar,
           coalesce(sum(balance) filter (where balance > 0 and balance_age >= 30), 0) as ar_past
    from fr_customers group by office
  ),
  act as materialized (select customer_id, autopay, autopay_profile_id from fr_customers where status = 1),
  rec as materialized (
    select s.subscription_id, s.office, s.customer_id, s.service_type, s.on_hold, s.next_service, s.seasonal_start, s.seasonal_end
    from fr_subscriptions s join act a on a.customer_id = s.customer_id
    where s.active and (s.frequency > 0 or s.frequency = -3)
  ),
  acct as (
    select distinct on (r.customer_id) r.office, r.customer_id,
           (coalesce(a.autopay, '') !~* '^(no|0|false|none|)$' and p.status = 1) as ap
    from rec r join act a on a.customer_id = r.customer_id
    left join fr_payment_profiles p on p.payment_profile_id = a.autopay_profile_id
  ),
  accts as (select office, count(*)::int as accounts, count(*) filter (where ap)::int as ap_valid from acct group by office),
  sched as materialized (
    select distinct subscription_id from fr_appointments where status = 0 and date >= today and subscription_id > 0
  ),
  pool as (
    select r.office, ops_season_md(r.seasonal_start) as sa, ops_season_md(r.seasonal_end) as sb, to_char(today, 'MM-DD') as chk
    from rec r
    where not coalesce(r.on_hold, false) and r.next_service is not null and r.next_service < today
      and not exists (select 1 from sched x where x.subscription_id = r.subscription_id)
  ),
  pp as (
    select office, count(*)::int as pool_past from pool
    where sa is null or sb is null or (case when sa <= sb then chk between sa and sb else chk >= sa or chk <= sb end)
    group by office
  )
  insert into office_kpi_days (day, office, accounts, ap_valid, ar, ar_past, pool_past, saved_at)
  select today, o.key, coalesce(a.accounts, 0), coalesce(a.ap_valid, 0), coalesce(r.ar, 0), coalesce(r.ar_past, 0), coalesce(p.pool_past, 0), now()
  from offices o
  left join accts a on a.office = o.key
  left join ar r on r.office = o.key
  left join pp p on p.office = o.key
  on conflict (day, office) do update set accounts = excluded.accounts, ap_valid = excluded.ap_valid, ar = excluded.ar,
    ar_past = excluded.ar_past, pool_past = excluded.pool_past, saved_at = excluded.saved_at;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.save_office_kpis() from public, anon, authenticated;

-- The daily route snapshot now also saves the office numbers (once a day, after 7 AM).
create or replace function public.snapshot_routes(p_replace boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  n integer;
begin
  if p_replace then delete from route_snapshots where snap_date = today; end if;
  insert into route_snapshots (snap_date, appointment_id, employee_id, office)
  select today, a.appointment_id, coalesce(nullif(a.assigned_tech, 0), rr.assigned_tech), a.office
  from fr_appointments a
  left join fr_routes rr on rr.route_id = a.route_id
  where a.date = today and coalesce(nullif(a.assigned_tech, 0), rr.assigned_tech) > 0
    and coalesce(a.status, 0) <> -1 and coalesce(a.status_text, '') !~* '(cancel|resched)'
  on conflict (snap_date, appointment_id) do nothing;
  get diagnostics n = row_count;
  begin
    perform save_office_kpis();
  exception when others then
    raise warning 'save_office_kpis failed: %', sqlerrm;   -- never let it stop the route snapshot
  end;
  return n;
end $$;

alter table public.competitions drop constraint if exists competitions_style_check;
alter table public.competitions add constraint competitions_style_check check (style in ('leaderboard', 'bracket', 'kpi'));

-- Office numbers for a KPI competition: sales and cancels counted over the period, accounts at the start,
-- and auto-pay / AR / job pool as of the end (the copy saved the morning after the end date, or the latest one).
-- Returns rates and counts only, no dollar amounts, so everyone can see the standings.
create or replace function public.office_kpi_board(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c competitions;
  today date := (now() at time zone 'America/New_York')::date;
  hi date;
  start_day date;
  end_day date;
  result jsonb;
begin
  if my_id() is null then return null; end if;
  select * into c from competitions where id = p_id;
  if not found then return null; end if;
  hi := least(c.end_date, today);
  -- start: first copy on or after the start date (else the latest before it); end: first copy after the end date, else the latest
  select coalesce((select min(day) from office_kpi_days where day >= c.start_date), (select max(day) from office_kpi_days where day < c.start_date)) into start_day;
  select coalesce((select min(day) from office_kpi_days where day > hi), (select max(day) from office_kpi_days)) into end_day;

  with sold as (
    select s.office, count(*)::int as n from fr_subscriptions s
    where hi >= c.start_date
      and s.date_added >= (c.start_date::timestamp at time zone 'America/New_York')
      and s.date_added < ((hi + 1)::timestamp at time zone 'America/New_York')
      and ops_line(s.service_type) is not null
    group by s.office
  ),
  cx as (
    select s.office, count(*)::int as n from fr_subscriptions s
    where hi >= c.start_date and s.date_cancelled between c.start_date and hi and ops_line(s.service_type) is not null
      and (coalesce(array_length(s.completed_appointment_ids, 1), 0) > 0 or s.initial_status = 1)
    group by s.office
  )
  select jsonb_build_object(
    'start_day', start_day, 'end_day', end_day, 'through', case when hi >= c.start_date then hi end,
    'offices', (select coalesce(jsonb_agg(jsonb_build_object(
        'office', o.key, 'sales', coalesce(sd.n, 0), 'cancels', coalesce(x.n, 0),
        'accounts_start', st.accounts, 'accounts', en.accounts, 'ap_valid', en.ap_valid,
        'ar_past_pct', case when en.ar > 0 then round(100 * en.ar_past / en.ar, 2) end,
        'pool_past', en.pool_past) order by o.key), '[]')
      from offices o
      left join sold sd on sd.office = o.key
      left join cx x on x.office = o.key
      left join office_kpi_days st on st.day = start_day and st.office = o.key
      left join office_kpi_days en on en.day = end_day and en.office = o.key)
  ) into result;
  return result;
end $$;
revoke all on function public.office_kpi_board(uuid) from public, anon;
grant execute on function public.office_kpi_board(uuid) to authenticated;

-- Start the history today.
select save_office_kpis();

commit;
