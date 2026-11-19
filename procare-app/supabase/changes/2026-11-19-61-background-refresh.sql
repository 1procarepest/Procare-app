-- 61 (2026-11-19). Heavy numbers are recalculated in the background, so nobody waits on them.
-- FieldRoutes data only changes when Procare Sync runs (about every 15 minutes), so every 10 minutes a scheduled
-- job (pg_cron) recalculates the saved copies people are using, and the pages just read them:
--   Operations Suite (ops_suite, every period someone viewed that includes today or yesterday),
--   AR & job pool (ops_snapshot), Rep Cards (rep_cards) and the Sales Leaderboard (sales_leaderboard).
-- Saved copies now count as fresh for 20 minutes (was 5), so a page only calculates itself if the job missed a run.
-- The Technician Performance Card is left as it was (its numbers include a per-viewer detail flag).
-- The job runs the calculations as the President, so they see every office (the results are the same for everyone
-- who may open those pages). Nobody can call refresh_saved_reports() from the app; only the scheduled job runs it.
-- Safe to run twice.

begin;

create extension if not exists pg_cron;

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

-- 2. The background refresh ---------------------------------------------------------------------------------
create or replace function public.refresh_saved_reports()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  boss uuid;
  today date := (now() at time zone 'America/New_York')::date;
  c record;
  p text[];
  d jsonb;
  n integer := 0;
  bad integer := 0;
begin
  -- Run the calculations as the President (sees every office)
  select auth_user_id into boss from employees where level = 'president' and active and auth_user_id is not null limit 1;
  if boss is null then return 'no signed-up President to run as'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', boss, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', boss::text, true);

  begin
    d := ops_snapshot_calc();
    if d is not null then perform rpc_cache_put('ops_snapshot', 'now', d); n := n + 1; end if;
  exception when others then bad := bad + 1;
  end;

  -- Every saved copy whose period reaches today or yesterday (older periods don't change)
  for c in select fn, k from rpc_cache where fn in ('ops_suite', 'rep_cards', 'sales_leaderboard') loop
    p := string_to_array(c.k, '|');
    continue when coalesce(p[2], '') !~ '^\d{4}-\d{2}-\d{2}$' or p[2]::date < today - 1;
    begin
      if c.fn = 'ops_suite' then
        d := ops_suite_calc(p[1]::date, p[2]::date, nullif(p[3], '')::date, nullif(p[4], '')::date);
      elsif c.fn = 'rep_cards' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]') into d from rep_cards_calc(p[1]::date, p[2]::date) r;
      else
        d := sales_leaderboard_calc(p[1]::date, p[2]::date, coalesce(p[3], 'sold'));
      end if;
      if d is not null then perform rpc_cache_put(c.fn, c.k, d); n := n + 1; end if;
    exception when others then bad := bad + 1;
    end;
  end loop;
  return n || ' refreshed' || case when bad > 0 then ', ' || bad || ' failed' else '' end;
end $$;
revoke all on function public.refresh_saved_reports() from public, anon, authenticated;

commit;

-- 3. Every 10 minutes (replaces the job if it already exists)
select cron.schedule('procare-refresh-reports', '*/10 * * * *', 'select public.refresh_saved_reports()');

-- Check: run it once now and show the schedule
select 'refresh now' as what, public.refresh_saved_reports() as detail
union all
select 'scheduled', schedule || ' (' || jobname || ')' from cron.job where jobname = 'procare-refresh-reports';
