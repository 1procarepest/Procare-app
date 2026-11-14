-- 2026-11-14. Operations Suite: replaces the "Procare Operation Suite" Google Apps Script.
-- Reads the FieldRoutes copy tables only (no FieldRoutes calls).
--
-- Who can see it (can_see_ops): everyone active except technician and sales team members,
-- the same as the app's menu (lib/apps.js). AR and auto-pay are sensitive, so the check is here too.
--
-- ops_suite(p_from, p_to, p_cfrom, p_cto): sales, cancels, completed jobs and reservices per office,
--   for the period and the earlier stretch it's compared with ('cur' and 'prior'). Returns JSON lists.
-- ops_snapshot(): AR aging, auto-pay and the job pool per office, as of right now.
--
-- Rules carried over from the old Operations Suite:
--   Core lines by service type name (first match wins): General Pest, Mosquito Green, Mosquito,
--     Termite Baiting. Anything "one time" is never core ("Other services").
--   Future revenue = recurring price x billings a year (30 days 12, 60 days 6, 90 days 4, 360/365 1;
--     billed after each service 4, or 7 for Mosquito and Mosquito Green; anything else priced as
--     custom: $50 or less 12, up to $399.99 4, else 1). Initial fees never count.
--   New customers = customers added in the period who bought a core service in it.
--   Who sold it = the FieldRoutes user type of the first salesperson (2 sales rep, 1 tech, 0 office).
--   Cancels count core services cancelled in the period that had at least one completed service.
--   Reservices by appointment type name: "partial" = Partial (weather), "incomplete" = Incomplete
--     (missing materials), any other reservice = callback. Rates are out of regular (non-reservice)
--     completed services in the core lines. (The old suite had partial and incomplete labels swapped.)
--   Recurring account = active customer with an active scheduled subscription (frequency > 0 or custom).
--     Valid auto-pay = auto-pay on and its payment profile valid (status 1).
--   Job pool = recurring, not on hold, in season, next service date past due / this month / next month,
--     and no pending appointment today or later ("scheduled").

begin;

create or replace function public.can_see_ops()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e
                 where e.id = my_id() and e.active and (e.level <> 'team_member' or e.department = 'administrative'))
$$;
revoke all on function public.can_see_ops() from public, anon;
grant execute on function public.can_see_ops() to authenticated;

-- Core service line from a service type name, or null.
create or replace function public.ops_line(type_name text)
returns text language sql immutable as $$
  select case
    when type_name is null or lower(type_name) ~ 'one[ -]time' then null
    when lower(type_name) like '%general pest%' then 'pest'
    when lower(type_name) like '%mosquito green%' then 'green'
    when lower(type_name) like '%mosquito%' then 'mosq'
    when lower(type_name) like '%termite baiting%' then 'termite'
  end
$$;

-- Yearly revenue of one service (see the rules above).
create or replace function public.ops_far(price numeric, billing text, line text)
returns numeric language sql immutable as $$
  select round(coalesce(price, 0) * case
    when billing in ('0', '-1') then case when line in ('mosq', 'green') then 7 else 4 end
    when billing = '30' then 12 when billing = '60' then 6 when billing = '90' then 4
    when billing in ('360', '365') then 1
    when coalesce(price, 0) <= 50 then 12 when price <= 399.99 then 4 else 1 end, 2)
$$;

-- "MM-DD" from a season date (full date, "MM-DD", or a number like 301 / 1031); null if unreadable.
create or replace function public.ops_season_md(v text)
returns text language sql immutable as $$
  select case
    when v ~ '^\d{4}-\d{2}-\d{2}' then nullif(substr(v, 6, 5), '00-00')
    when v ~ '^\d{2}-\d{2}$' then v
    when v ~ '^\d{3,4}$' then substr(lpad(v, 4, '0'), 1, 2) || '-' || substr(lpad(v, 4, '0'), 3, 2)
  end
$$;

drop function if exists public.ops_suite(date, date, date, date);
create function public.ops_suite(p_from date, p_to date, p_cfrom date, p_cto date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  result jsonb;
begin
  if not can_see_ops() or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then return null; end if;

  with win as materialized (
    select 'cur'::text as w, p_from as s, p_to as e
    union all select 'prior', p_cfrom, p_cto where p_cfrom is not null and p_cto is not null and p_cto >= p_cfrom
  ),
  emp as materialized (
    select distinct on (employee_id) employee_id, type from fr_employees order by employee_id, active desc nulls last
  ),
  sold as materialized (
    select w.w, s.office, s.customer_id, ops_line(s.service_type) as line,
           coalesce(nullif(trim(s.source), ''), 'Unknown') as source,
           case em.type when 2 then 'Sales Reps' when 1 then 'Technicians' when 0 then 'Office Staff' else 'Unassigned' end as seller,
           ops_far(s.recurring_charge, s.billing_frequency, ops_line(s.service_type)) as far,
           (coalesce(s.autopay_payment_profile_id, 0) > 0 or coalesce(c.autopay, '') !~* '^(no|0|false|none|)$') as ap,
           coalesce((c.date_added at time zone 'America/New_York')::date between w.s and w.e, false) as new_cust
    from win w
    join fr_subscriptions s on s.date_added >= (w.s::timestamp at time zone 'America/New_York')
                           and s.date_added < ((w.e + 1)::timestamp at time zone 'America/New_York')
    left join fr_customers c on c.customer_id = s.customer_id
    left join emp em on em.employee_id = s.sold_by
  ),
  cx as materialized (
    select w.w, s.office, ops_far(s.recurring_charge, s.billing_frequency, ops_line(s.service_type)) as far,
           coalesce(nullif(trim(s.cancel_reason), ''), 'Not specified') as reason
    from win w
    join fr_subscriptions s on s.date_cancelled between w.s and w.e
    where ops_line(s.service_type) is not null
      and (coalesce(array_length(s.completed_appointment_ids, 1), 0) > 0 or s.initial_status = 1)
  ),
  done as materialized (
    select w.w, a.office, ops_line(t.description) as line, coalesce(reservice_kind(t.description), 'base') as kind
    from win w
    join fr_appointments a on a.date between w.s and w.e and a.status = 1
    left join fr_service_types t on t.office = a.office and t.type_id = a.type_id
  )
  select jsonb_build_object(
    'sales', (select coalesce(jsonb_agg(x), '[]') from (
        select w, office, count(*) filter (where line is not null) as services,
               count(distinct customer_id) filter (where line is not null and new_cust) as new_customers,
               coalesce(sum(far) filter (where line is not null), 0) as far,
               count(*) filter (where line is null) as other_n, coalesce(sum(far) filter (where line is null), 0) as other_far
        from sold group by w, office) x),
    'sources', (select coalesce(jsonb_agg(x), '[]') from (
        select w, office, source as label, count(*) as n from sold where line is not null group by w, office, source) x),
    'sellers', (select coalesce(jsonb_agg(x), '[]') from (
        select w, office, seller as label, count(*) as n, sum(far) as far, count(*) filter (where ap) as ap
        from sold where line is not null group by w, office, seller) x),
    'cancels', (select coalesce(jsonb_agg(x), '[]') from (
        select w, office, count(*) as n, sum(far) as far from cx group by w, office) x),
    'reasons', (select coalesce(jsonb_agg(x), '[]') from (
        select w, office, reason as label, count(*) as n from cx group by w, office, reason) x),
    'done', (select coalesce(jsonb_agg(x), '[]') from (
        select w, office, count(*) as n from done group by w, office) x),
    'lines', (select coalesce(jsonb_agg(x), '[]') from (
        select w, office, line, count(*) filter (where kind = 'base') as base,
               count(*) filter (where kind = 'reservice') as callback,
               count(*) filter (where kind = 'partial') as partial,
               count(*) filter (where kind = 'incomplete') as incomplete
        from done where line is not null group by w, office, line) x),
    'remaining', (select coalesce(jsonb_agg(x), '[]') from (
        select office, count(*) as n from fr_appointments where date = today and status = 0 group by office) x)
  ) into result;
  return result;
end $$;
revoke all on function public.ops_suite(date, date, date, date) from public, anon;
grant execute on function public.ops_suite(date, date, date, date) to authenticated;

drop function if exists public.ops_snapshot();
create function public.ops_snapshot()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  this_end date := (date_trunc('month', today) + interval '1 month - 1 day')::date;
  next_end date := (date_trunc('month', today) + interval '2 months - 1 day')::date;
  result jsonb;
begin
  if not can_see_ops() then return null; end if;

  with ar as (
    select office,
           coalesce(sum(balance) filter (where balance > 0), 0) as ar,
           coalesce(sum(balance) filter (where balance > 0 and coalesce(balance_age, 0) < 30), 0) as cur,
           coalesce(sum(balance) filter (where balance > 0 and balance_age between 30 and 59), 0) as d30,
           coalesce(sum(balance) filter (where balance > 0 and balance_age between 60 and 89), 0) as d60,
           coalesce(sum(balance) filter (where balance > 0 and balance_age >= 90), 0) as d90
    from fr_customers group by office
  ),
  act as materialized (select customer_id, autopay, autopay_profile_id from fr_customers where status = 1),
  rec as materialized (
    select s.subscription_id, s.office, s.customer_id, s.service_type, s.autopay_payment_profile_id,
           s.on_hold, s.next_service, s.seasonal_start, s.seasonal_end
    from fr_subscriptions s join act a on a.customer_id = s.customer_id
    where s.active and (s.frequency > 0 or s.frequency = -3)
  ),
  acct as materialized (
    select distinct on (r.customer_id) r.office, r.customer_id,
           case when coalesce(a.autopay, '') ~* '^(no|0|false|none|)$' then ''
                when p.status = 1 then 'valid' else 'invalid' end as ap
    from rec r join act a on a.customer_id = r.customer_id
    left join fr_payment_profiles p on p.payment_profile_id = a.autopay_profile_id
  ),
  accts as (
    select office, count(*) as accounts, count(*) filter (where ap = 'valid') as ap_valid,
           count(*) filter (where ap = 'invalid') as ap_invalid
    from acct group by office
  ),
  subs as (
    select r.office, count(*) as subs,
           count(*) filter (where (coalesce(r.autopay_payment_profile_id, 0) > 0 and p.status = 1) or ac.ap = 'valid') as ap_subs
    from rec r left join fr_payment_profiles p on p.payment_profile_id = r.autopay_payment_profile_id
    left join acct ac on ac.customer_id = r.customer_id
    group by r.office
  ),
  sched as materialized (
    select distinct subscription_id from fr_appointments where status = 0 and date >= today and subscription_id > 0
  ),
  pool as materialized (
    select r.office, ops_line(r.service_type) is not null as core,
           case when r.next_service < today then 'past' when r.next_service <= this_end then 'this' else 'next' end as bucket,
           exists (select 1 from sched x where x.subscription_id = r.subscription_id) as scheduled,
           ops_season_md(r.seasonal_start) as sa, ops_season_md(r.seasonal_end) as sb,
           to_char(case when r.next_service < today then today else r.next_service end, 'MM-DD') as chk
    from rec r
    where not coalesce(r.on_hold, false) and r.next_service is not null and r.next_service <= next_end
  ),
  inseason as (
    select * from pool
    where sa is null or sb is null
       or (case when sa <= sb then chk between sa and sb else chk >= sa or chk <= sb end)
  ),
  jp as (
    select office, bucket,
           count(*) filter (where not scheduled and core) as left_core,
           count(*) filter (where not scheduled and not core) as left_other,
           count(*) filter (where scheduled) as scheduled
    from inseason group by office, bucket
  )
  select jsonb_build_object(
    'as_of', now(),
    'this_month', to_char(today, 'Mon'), 'next_month', to_char(next_end, 'Mon'),
    'ar', (select coalesce(jsonb_agg(x), '[]') from ar x),
    'accounts', (select coalesce(jsonb_agg(x), '[]') from accts x),
    'subs', (select coalesce(jsonb_agg(x), '[]') from subs x),
    'pool', (select coalesce(jsonb_agg(x), '[]') from jp x)
  ) into result;
  return result;
end $$;
revoke all on function public.ops_snapshot() from public, anon;
grant execute on function public.ops_snapshot() to authenticated;

-- When the FieldRoutes copy was last refreshed (shown as "Updated …").
create or replace function public.fr_last_sync()
returns timestamptz language sql stable security definer set search_path = public as $$
  select case when my_id() is null then null else (select max(finished_at) from fr_sync_runs where ok) end
$$;
revoke all on function public.fr_last_sync() from public, anon;
grant execute on function public.fr_last_sync() to authenticated;

commit;
