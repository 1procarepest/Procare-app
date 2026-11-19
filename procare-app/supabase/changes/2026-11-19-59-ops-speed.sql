-- 59 (2026-11-19). Operations Suite timing out ("canceling statement due to statement timeout").
-- ops_suite() and ops_snapshot() recalculated from every FieldRoutes customer, subscription and appointment on
-- each page view, and passed Supabase's 8-second limit. Same fix as change 45 (rep cards):
--  1. Each is renamed to <name>_calc (the calculation, unchanged) and a same-named function in front returns
--     the saved result when it's under 5 minutes old. The answers don't depend on who asks (only who may ask).
--  2. Two indexes so "sold between these dates" and "canceled between these dates" don't read every
--     subscription (the existing ones start with office, which these lookups don't filter on).
--  3. Signed-in requests may run up to 20 seconds (was 8), so the first calculation after the 5 minutes can
--     finish and be saved instead of timing out over and over.
-- Safe to run twice.

begin;

-- 1. Saved results ------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.ops_suite_calc(date, date, date, date)') is null then
    alter function public.ops_suite(date, date, date, date) rename to ops_suite_calc;
  end if;
  if to_regprocedure('public.ops_snapshot_calc()') is null then
    alter function public.ops_snapshot() rename to ops_snapshot_calc;
  end if;
end $$;
revoke all on function public.ops_suite_calc(date, date, date, date) from public, anon, authenticated;
revoke all on function public.ops_snapshot_calc() from public, anon, authenticated;

create or replace function public.ops_suite(p_from date, p_to date, p_cfrom date, p_cto date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  k text := concat_ws('|', p_from, p_to, p_cfrom, p_cto);
  d jsonb;
begin
  if not can_see_ops() then return null; end if;
  d := rpc_cache_get('ops_suite', k);
  if d is null then
    d := ops_suite_calc(p_from, p_to, p_cfrom, p_cto);
    if d is not null then perform rpc_cache_put('ops_suite', k, d); end if;
  end if;
  return d;
end $$;
revoke all on function public.ops_suite(date, date, date, date) from public, anon;
grant execute on function public.ops_suite(date, date, date, date) to authenticated;

create or replace function public.ops_snapshot()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  d jsonb;
begin
  if not can_see_ops() then return null; end if;
  d := rpc_cache_get('ops_snapshot', 'now');
  if d is null then
    d := ops_snapshot_calc();
    if d is not null then perform rpc_cache_put('ops_snapshot', 'now', d); end if;
  end if;
  return d;
end $$;
revoke all on function public.ops_snapshot() from public, anon;
grant execute on function public.ops_snapshot() to authenticated;

-- 2. Indexes -------------------------------------------------------------------------------------------------
create index if not exists fr_subscriptions_added on public.fr_subscriptions (date_added);
create index if not exists fr_subscriptions_cancelled_on on public.fr_subscriptions (date_cancelled);

-- 3. Time limit for signed-in requests --------------------------------------------------------------------
alter role authenticated set statement_timeout = '20s';

commit;

-- Supabase's API picks up the new time limit
notify pgrst, 'reload config';

-- Check: both functions in front, both calculations behind them, and the time limit
select p.proname as function, 'ok' as status from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('ops_suite', 'ops_suite_calc', 'ops_snapshot', 'ops_snapshot_calc')
union all
select 'time limit for signed-in users', coalesce((select split_part(c, '=', 2) from pg_db_role_setting s
  join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) c where r.rolname = 'authenticated' and c like 'statement_timeout=%'), 'default');
