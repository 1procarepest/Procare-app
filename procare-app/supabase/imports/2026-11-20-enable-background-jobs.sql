-- 2026-11-20. Turn on the background refresh (change 61 never got scheduled: pg_cron wasn't on in Supabase).
-- First turn on pg_cron: Supabase -> Database -> Extensions -> search "pg_cron" -> enable. Then run this.
--  * Saved copies of the Operations Suite, AR & job pool, Rep Cards and Sales Leaderboard count as fresh for
--    20 minutes (change 61's part that may not have saved).
--  * Every 10 minutes refresh_saved_reports() recalculates them (it already includes the Technician card and
--    Wildlife from changes 62-63).
-- Safe to run twice. Sale credits (change 70) are NOT started here; that's the launch-day script.

create extension if not exists pg_cron;

begin;

-- 1. Saved copies stay fresh for 20 minutes -----------------------------------------------------------------
create or replace function public.ops_suite(p_from date, p_to date, p_cfrom date, p_cto date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  k text := concat_ws('|', p_from, p_to, p_cfrom, p_cto);
  d jsonb;
begin
  if not can_see_ops() then return null; end if;
  d := rpc_cache_get('ops_suite', k, interval '20 minutes');
  if d is null then
    d := ops_suite_calc(p_from, p_to, p_cfrom, p_cto);
    if d is not null then perform rpc_cache_put('ops_suite', k, d); end if;
  end if;
  return d;
end $$;

create or replace function public.ops_snapshot()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  d jsonb;
begin
  if not can_see_ops() then return null; end if;
  d := rpc_cache_get('ops_snapshot', 'now', interval '20 minutes');
  if d is null then
    d := ops_snapshot_calc();
    if d is not null then perform rpc_cache_put('ops_snapshot', 'now', d); end if;
  end if;
  return d;
end $$;

create or replace function public.rep_cards(p_from date, p_to date)
returns setof public.rep_cards_row language plpgsql volatile security definer set search_path = public as $$
declare
  k text := p_from::text || '|' || p_to::text;
  d jsonb;
begin
  if my_id() is null then return; end if;
  d := rpc_cache_get('rep_cards', k, interval '20 minutes');
  if d is null then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into d from rep_cards_calc(p_from, p_to) r;
    perform rpc_cache_put('rep_cards', k, d);
  end if;
  return query select * from jsonb_populate_recordset(null::public.rep_cards_row, d);
end $$;

create or replace function public.sales_leaderboard(p_from date, p_to date, p_basis text default 'sold')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  k text := p_from::text || '|' || p_to::text || '|' || coalesce(p_basis, 'sold');
  d jsonb;
begin
  if my_id() is null then return null; end if;
  d := rpc_cache_get('sales_leaderboard', k, interval '20 minutes');
  if d is null then
    d := sales_leaderboard_calc(p_from, p_to, p_basis);
    if d is not null then perform rpc_cache_put('sales_leaderboard', k, d); end if;
  end if;
  return d;
end $$;

commit;

select cron.schedule('procare-refresh-reports', '*/10 * * * *', 'select public.refresh_saved_reports()');

-- Check: run the refresh once now, and list the scheduled jobs
select 'refresh now' as what, public.refresh_saved_reports() as detail
union all
select 'scheduled: ' || jobname, schedule from cron.job order by 1;
