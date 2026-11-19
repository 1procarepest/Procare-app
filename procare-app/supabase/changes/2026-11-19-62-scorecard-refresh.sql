-- 62 (2026-11-19). The Technician Performance Card joins the background refresh (change 61).
-- Its numbers are the same for everyone who opens it ("everyone sees the full leaderboard"), so the job can
-- recalculate it every 10 minutes like the Operations Suite and Rep Cards. Its saved copy now counts as fresh for
-- 20 minutes (was 5). Hidden columns don't change the work: one calculation fills every column at once.
-- Safe to run twice.

begin;

create or replace function public.tech_scorecard(p_period text default 'thisMonth')
returns setof public.tech_scorecard_row language plpgsql volatile security definer set search_path = public as $$
declare
  k text := coalesce(p_period, 'thisMonth');
  d jsonb;
begin
  if my_id() is null then return; end if;
  d := rpc_cache_get('tech_scorecard', k, interval '20 minutes');
  if d is null then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into d from tech_scorecard_calc(p_period) r;
    perform rpc_cache_put('tech_scorecard', k, d);
  end if;
  return query select * from jsonb_populate_recordset(null::public.tech_scorecard_row, d);
end $$;

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

  -- Technician Performance Card (change 62): one saved copy per period name (today, thisWeek, thisMonth, ...)
  for c in select k from rpc_cache where fn = 'tech_scorecard' loop
    begin
      select coalesce(jsonb_agg(to_jsonb(r)), '[]') into d from tech_scorecard_calc(c.k) r;
      perform rpc_cache_put('tech_scorecard', c.k, d); n := n + 1;
    exception when others then bad := bad + 1;
    end;
  end loop;

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

-- Check: run the refresh once now (the count includes the scorecard periods people have opened today)
select public.refresh_saved_reports() as refreshed;
