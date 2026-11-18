-- 2026-11-18 (change 51). John's list:
--   1. Manager bonus cancellation rate leaves out cancels for moving and money reasons. Which FieldRoutes cancel
--      reasons are left out is a list in bonus_settings.cancel_reasons_skip (switches in Settings → Bonuses →
--      Settings). It starts with every reason whose name mentions moving or money.
--   2. Reservice rate as a bonus goal: reservices + incompletes ÷ regular completed services in the core lines,
--      the same rule as the Operations page (partial / weather reservices never count).
--   3. Prize payouts can be edited (amount, note) or deleted. Deleting either sends the prizes back to the person's
--      Earnings, or deletes them for good.
--   4. Time off: an approver can put someone back to work on one day of their time off (time_off_work_day).
begin;

-- ---------- 1 + 2. Bonus numbers ----------
alter table public.bonus_settings add column if not exists cancel_reasons_skip text[] not null default '{}';

update public.bonus_settings
set cancel_reasons_skip = coalesce((
  select array_agg(distinct trim(cancel_reason) order by trim(cancel_reason))
  from fr_subscriptions
  where trim(coalesce(cancel_reason, '')) <> ''
    and cancel_reason ~* '(mov|relocat|financ|afford|money|budget|billing|collection|price|cost|income|job|unemploy|hardship|expens)'
), '{}')
where id = 1 and cancel_reasons_skip = '{}';

-- Adds to change 47's numbers:
--   cancels      now leaves out cancel reasons in bonus_settings.cancel_reasons_skip
--   cancels_all  every core cancel, as before
--   resv / resv_base  reservices + incompletes, and regular completed services (core lines) in the period
--   'cancel_reasons' lists every cancel reason with its count and whether it's skipped.
create or replace function public.bonus_numbers_calc(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  hi date := least(p_to, today);
  start_day date;
  end_day date;
  off text[];
  skip text[];
  result jsonb;
begin
  select coalesce(sources_off, '{}'), coalesce(cancel_reasons_skip, '{}') into off, skip from bonus_settings where id = 1;
  off := coalesce(off, '{}');
  skip := coalesce(skip, '{}');
  select coalesce((select min(day) from office_kpi_days where day >= p_from), (select max(day) from office_kpi_days where day < p_from)) into start_day;
  select coalesce((select min(day) from office_kpi_days where day > hi), (select max(day) from office_kpi_days)) into end_day;

  with emp as materialized (
    select distinct on (employee_id) employee_id, type from fr_employees order by employee_id, active desc nulls last
  ),
  sold as materialized (
    select s.office, coalesce(nullif(trim(s.source), ''), 'Unknown') as source, em.type,
           coalesce(c.date_added >= s.date_added - interval '30 days', false) as new_cust
    from fr_subscriptions s
    left join fr_customers c on c.customer_id = s.customer_id
    left join emp em on em.employee_id = s.sold_by
    where hi >= p_from
      and s.date_added >= (p_from::timestamp at time zone 'America/New_York')
      and s.date_added < ((hi + 1)::timestamp at time zone 'America/New_York')
      and ops_line(s.service_type) is not null
  ),
  mk as (
    select office, source, count(*)::int as n from sold
    where new_cust and coalesce(type, 0) not in (1, 2)
    group by office, source
  ),
  cx0 as materialized (
    select s.office, coalesce(nullif(trim(s.cancel_reason), ''), 'Not specified') as reason
    from fr_subscriptions s
    where hi >= p_from and s.date_cancelled between p_from and hi and ops_line(s.service_type) is not null
      and (coalesce(array_length(s.completed_appointment_ids, 1), 0) > 0 or s.initial_status = 1)
  ),
  cx as (
    select office, count(*)::int as n, count(*) filter (where not (reason = any (skip)))::int as kept
    from cx0 group by office
  ),
  done as materialized (
    select a.office, coalesce(reservice_kind(t.description), 'base') as kind
    from fr_appointments a
    left join fr_service_types t on t.office = a.office and t.type_id = a.type_id
    where hi >= p_from and a.date between p_from and hi and a.status = 1 and ops_line(t.description) is not null
  ),
  rs as (
    select office, count(*) filter (where kind = 'base')::int as base,
           count(*) filter (where kind in ('reservice', 'incomplete'))::int as resv
    from done group by office
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'through', case when hi >= p_from then hi end,
    'start_day', start_day, 'end_day', end_day,
    'offices', (select coalesce(jsonb_agg(jsonb_build_object(
        'office', o.key,
        'sales', (select count(*) from sold x where x.office = o.key),
        'tech_sales', (select count(*) from sold x where x.office = o.key and x.type = 1),
        'marketing', (select coalesce(sum(n), 0) from mk where mk.office = o.key and not (mk.source = any (off))),
        'cancels', coalesce((select kept from cx where cx.office = o.key), 0),
        'cancels_all', coalesce((select n from cx where cx.office = o.key), 0),
        'resv', coalesce((select resv from rs where rs.office = o.key), 0),
        'resv_base', coalesce((select base from rs where rs.office = o.key), 0),
        'accounts_start', st.accounts, 'ap_start', st.ap_valid, 'ar_past_start', st.ar_past, 'pool_start', st.pool_past,
        'accounts', en.accounts, 'ap_valid', en.ap_valid, 'ar_past', en.ar_past, 'pool_past', en.pool_past) order by o.key), '[]')
      from offices o
      left join office_kpi_days st on st.day = start_day and st.office = o.key
      left join office_kpi_days en on en.day = end_day and en.office = o.key),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'n', n, 'off', source = any (off)) order by n desc), '[]')
      from (select source, sum(n)::int as n from mk group by source) y),
    'cancel_reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'n', n, 'skip', reason = any (skip)) order by n desc), '[]')
      from (select reason, count(*)::int as n from cx0 group by reason) z)
  ) into result;
  return result;
end $$;
revoke all on function public.bonus_numbers_calc(date, date) from public, anon, authenticated;

-- New goal kind 'resv' (reservice rate).
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.bonus_goals'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%';
  if c is not null then
    execute format('alter table public.bonus_goals drop constraint %I', c);
    alter table public.bonus_goals add constraint bonus_goals_kind_check check (kind in (
      'tech_sales', 'office_sales', 'marketing_sales', 'reports', 'autopay', 'ar_past', 'cancel', 'resv', 'pool',
      'cost_per_customer', 'logged', 'project'));
  end if;
end $$;

-- Saved numbers were counted the old way.
delete from rpc_cache where fn = 'bonus_numbers';

-- ---------- 3. Prize payouts: edit and delete ----------
create or replace function public.update_payout(p_id uuid, p_amount numeric, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_payouts() or p_amount is null or p_amount <= 0 then return false; end if;
  update payout_requests set amount = round(p_amount, 2), note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id;
  return found;
end $$;
revoke all on function public.update_payout(uuid, numeric, text) from public, anon;
grant execute on function public.update_payout(uuid, numeric, text) to authenticated;

-- p_keep_prizes true: the prizes go back to the person's Earnings (they can cash out again).
-- false: the prizes are deleted too and won't be paid.
create or replace function public.delete_payout(p_id uuid, p_keep_prizes boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_payouts() then return false; end if;
  if p_keep_prizes then
    update competition_awards set payout_id = null where payout_id = p_id;
  else
    delete from competition_awards where payout_id = p_id;
  end if;
  delete from payout_requests where id = p_id;
  return found;
end $$;
revoke all on function public.delete_payout(uuid, boolean) from public, anon;
grant execute on function public.delete_payout(uuid, boolean) to authenticated;

-- ---------- 4. Time off: back to work on one day ----------
-- For whoever approves that person's time off. Takes one day out of a waiting or approved request: shortens it,
-- splits it in two, or cancels it when it was that one day. Returns 'cancelled', 'shortened', 'split' or null.
create or replace function public.time_off_work_day(p_id uuid, p_day date)
returns text language plpgsql security definer set search_path = public as $$
declare
  r time_off_requests;
  new_id uuid;
begin
  select * into r from time_off_requests where id = p_id;
  if r.id is null or r.status not in ('pending', 'approved') then return null; end if;
  if not can_approve_time_off(r.employee_id) then return null; end if;
  if p_day < r.start_date or p_day > r.end_date then return null; end if;

  if r.start_date = r.end_date then
    update time_off_requests set status = 'cancelled', decision_note = coalesce(decision_note, 'Back to work') where id = p_id;
    return 'cancelled';
  elsif p_day = r.start_date then
    update time_off_requests set start_date = p_day + 1 where id = p_id;
    return 'shortened';
  elsif p_day = r.end_date then
    update time_off_requests set end_date = p_day - 1 where id = p_id;
    return 'shortened';
  end if;

  update time_off_requests set end_date = p_day - 1 where id = p_id;
  insert into time_off_requests (employee_id, start_date, end_date, use_pto, note, created_at)
  values (r.employee_id, p_day + 1, r.end_date, r.use_pto, r.note, r.created_at)
  returning id into new_id;
  -- guard_time_off() starts new rows as pending; carry the original decision over.
  update time_off_requests set status = r.status, decision_note = r.decision_note, use_pto = r.use_pto where id = new_id;
  update time_off_requests set decided_by = r.decided_by, decided_at = r.decided_at where id = new_id;
  return 'split';
end $$;
revoke all on function public.time_off_work_day(uuid, date) from public, anon;
grant execute on function public.time_off_work_day(uuid, date) to authenticated;

commit;
