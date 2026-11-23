-- 88 (2026-11-23). Rep Cards load faster (John): each card's history table (rep_card_extras, change 53) is now
-- kept 20 minutes like the cards themselves, and a background job re-figures every saved copy for today or
-- yesterday every 10 minutes, so nobody waits for it to be worked out when they open Rep Cards.
-- A separate job, so the main background refresh (changes 61-63) is untouched.
-- Safe to run twice.
begin;

create or replace function public.rep_card_extras(p_grain text, p_to date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  k text := coalesce(p_grain, '') || '|' || coalesce(p_to::text, '');
  d jsonb;
begin
  if my_id() is null or p_to is null or p_grain not in ('day', 'week', 'month', 'year') then return null; end if;
  d := rpc_cache_get('rep_card_extras', k, interval '20 minutes');
  if d is null then
    d := rep_card_extras_calc(p_grain, p_to);
    perform rpc_cache_put('rep_card_extras', k, d);
  end if;
  return d;
end $$;
revoke all on function public.rep_card_extras(text, date) from public, anon;
grant execute on function public.rep_card_extras(text, date) to authenticated;

create or replace function public.refresh_rep_card_extras()
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
  -- Run as the President (sees every office), the same as refresh_saved_reports()
  select auth_user_id into boss from employees where level = 'president' and active and auth_user_id is not null limit 1;
  if boss is null then return 'no signed-up President to run as'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', boss, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', boss::text, true);

  -- Saved copies are keyed grain|to date; only ones that reach today or yesterday can change
  for c in select k from rpc_cache where fn = 'rep_card_extras' loop
    p := string_to_array(c.k, '|');
    continue when coalesce(p[2], '') !~ '^\d{4}-\d{2}-\d{2}$' or p[2]::date < today - 1
      or coalesce(p[1], '') not in ('day', 'week', 'month', 'year');
    begin
      d := rep_card_extras_calc(p[1], p[2]::date);
      perform rpc_cache_put('rep_card_extras', c.k, d); n := n + 1;
    exception when others then bad := bad + 1;
    end;
  end loop;
  return n || ' refreshed' || case when bad > 0 then ', ' || bad || ' failed' else '' end;
end $$;
revoke all on function public.refresh_rep_card_extras() from public, anon, authenticated;

commit;

-- Every 10 minutes, offset 5 minutes from the main refresh (replaces the job if it already exists)
select cron.schedule('procare-refresh-rep-history', '5-59/10 * * * *', 'select public.refresh_rep_card_extras()');

-- Check: run it once now and show the schedule
select 'refresh now' as what, public.refresh_rep_card_extras() as detail
union all
select 'scheduled', schedule || ' (' || jobname || ')' from cron.job where jobname = 'procare-refresh-rep-history';
