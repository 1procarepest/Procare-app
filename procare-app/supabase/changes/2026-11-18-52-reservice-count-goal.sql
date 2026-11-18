-- 2026-11-18 (change 52). Reservices as a count goal ("under 450 reservices this quarter", Lisa).
-- bonus_numbers_calc adds resv_all: completed reservices + incompletes in the period, every service line.
-- Partial (weather) reservices never count. New goal kind 'resv_count' (lower is better).
begin;

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
    select a.office, coalesce(reservice_kind(t.description), 'base') as kind, ops_line(t.description) is not null as core
    from fr_appointments a
    left join fr_service_types t on t.office = a.office and t.type_id = a.type_id
    where hi >= p_from and a.date between p_from and hi and a.status = 1
  ),
  rs as (
    select office, count(*) filter (where core and kind = 'base')::int as base,
           count(*) filter (where core and kind in ('reservice', 'incomplete'))::int as resv,
           count(*) filter (where kind in ('reservice', 'incomplete'))::int as resv_all
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
        'resv_all', coalesce((select resv_all from rs where rs.office = o.key), 0),
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

alter table public.bonus_goals drop constraint if exists bonus_goals_kind_check;
alter table public.bonus_goals add constraint bonus_goals_kind_check check (kind in (
  'tech_sales', 'office_sales', 'marketing_sales', 'reports', 'autopay', 'ar_past', 'cancel', 'resv', 'resv_count', 'pool',
  'cost_per_customer', 'logged', 'project'));

delete from rpc_cache where fn = 'bonus_numbers';

commit;
