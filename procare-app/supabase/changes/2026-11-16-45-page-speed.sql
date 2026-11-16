-- 2026-11-16-45 speed: rep cards, Sales Leaderboard, pay and the Technician Performance Card keep their
-- results for 5 minutes, like competitions (change 44). On 2026-11-16 at about 10:15 many people opened the app
-- at once and these timed out (Supabase's 8 s limit) because every page view recalculated them.
-- Each was renamed to <name>_calc (the calculation, unchanged) and a same-named function in front of it
-- returns the saved result when it's under 5 minutes old. The answers don't depend on who asks
-- (except pay: which rep, and whether the person manages pay, are part of the saved key).

begin;

create table if not exists public.rpc_cache (
  fn          text not null,
  k           text not null,
  data        jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (fn, k)
);
alter table public.rpc_cache enable row level security;   -- no policies: only the functions below use it

create or replace function public.rpc_cache_get(p_fn text, p_k text, p_ttl interval default interval '5 minutes')
returns jsonb language sql stable security definer set search_path = public as $$
  select data from rpc_cache where fn = p_fn and k = p_k and computed_at > now() - p_ttl
$$;
create or replace function public.rpc_cache_put(p_fn text, p_k text, p_data jsonb)
returns void language sql volatile security definer set search_path = public as $$
  insert into rpc_cache (fn, k, data, computed_at) values (p_fn, p_k, p_data, now())
  on conflict (fn, k) do update set data = excluded.data, computed_at = excluded.computed_at;
  delete from rpc_cache where computed_at < now() - interval '1 day';
$$;
revoke all on function public.rpc_cache_get(text, text, interval) from public, anon, authenticated;
revoke all on function public.rpc_cache_put(text, text, jsonb) from public, anon, authenticated;

-- Rename the calculations once (safe to run this file again).
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'rep_cards_calc') then alter function public.rep_cards(date, date) rename to rep_cards_calc; end if;
  if not exists (select 1 from pg_proc where proname = 'tech_scorecard_calc') then alter function public.tech_scorecard(text) rename to tech_scorecard_calc; end if;
  if not exists (select 1 from pg_proc where proname = 'sales_leaderboard_calc') then alter function public.sales_leaderboard(date, date, text) rename to sales_leaderboard_calc; end if;
  if not exists (select 1 from pg_proc where proname = 'comp_sales_calc') then alter function public.comp_sales(integer, uuid) rename to comp_sales_calc; end if;
end $$;
revoke all on function public.rep_cards_calc(date, date) from public, anon, authenticated;
revoke all on function public.tech_scorecard_calc(text) from public, anon, authenticated;
revoke all on function public.sales_leaderboard_calc(date, date, text) from public, anon, authenticated;
revoke all on function public.comp_sales_calc(integer, uuid) from public, anon, authenticated;

-- ---------- Rep cards ----------
drop type if exists public.rep_cards_row cascade;
create type public.rep_cards_row as (kind text, employee_id uuid, first_name text, last_name text, home_office text, photo_url text, office text, week date, reps integer, doors integer, convos integer, made_sale integer, call_back integer, gave_pitch integer, not_interested integer, not_home integer, never_knock integer, info integer, hours numeric, field_days integer, services integer, pest integer, termite integer, mosquito integer, new_customers integer, autopay integer, serviced integer, pending integer, due integer, canceled integer, far numeric, cv_pest numeric, cv_termite numeric, cv_mosquito numeric);
create or replace function public.rep_cards(p_from date, p_to date)
returns setof public.rep_cards_row language plpgsql volatile security definer set search_path = public as $$
declare
  k text := p_from::text || '|' || p_to::text;
  d jsonb;
begin
  if my_id() is null then return; end if;
  d := rpc_cache_get('rep_cards', k);
  if d is null then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into d from rep_cards_calc(p_from, p_to) r;
    perform rpc_cache_put('rep_cards', k, d);
  end if;
  return query select * from jsonb_populate_recordset(null::public.rep_cards_row, d);
end $$;
revoke all on function public.rep_cards(date, date) from public, anon;
grant execute on function public.rep_cards(date, date) to authenticated;

-- ---------- Technician Performance Card ----------
drop type if exists public.tech_scorecard_row cascade;
create type public.tech_scorecard_row as (employee_id uuid, first_name text, last_name text, office text, photo_url text, full_detail boolean, which text, sched integer, serv integer, prod numeric, stars integer, reviews integer, rating numeric, reservices integer, incompletes integer, partials integer, sold integer, sales_done integer, cx_tech integer, cx_billing integer, routed integer, route_done integer, sold_value numeric, sales_done_value numeric, drive_source text, drive_score integer, drive_miles integer, distracted integer, speed_pct numeric, harsh_brake integer, harsh_accel integer, harsh_turn integer, drive_hours numeric, crash integer, following integer, rolling_stops integer, seatbelt integer, autopay_added integer);
create or replace function public.tech_scorecard(p_period text default 'thisMonth')
returns setof public.tech_scorecard_row language plpgsql volatile security definer set search_path = public as $$
declare
  k text := coalesce(p_period, 'thisMonth');
  d jsonb;
begin
  if my_id() is null then return; end if;
  d := rpc_cache_get('tech_scorecard', k);
  if d is null then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into d from tech_scorecard_calc(p_period) r;
    perform rpc_cache_put('tech_scorecard', k, d);
  end if;
  return query select * from jsonb_populate_recordset(null::public.tech_scorecard_row, d);
end $$;
revoke all on function public.tech_scorecard(text) from public, anon;
grant execute on function public.tech_scorecard(text) to authenticated;

-- ---------- Sales Leaderboard ----------
create or replace function public.sales_leaderboard(p_from date, p_to date, p_basis text default 'sold')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  k text := p_from::text || '|' || p_to::text || '|' || coalesce(p_basis, 'sold');
  d jsonb;
begin
  if my_id() is null then return null; end if;
  d := rpc_cache_get('sales_leaderboard', k);
  if d is null then
    d := sales_leaderboard_calc(p_from, p_to, p_basis);
    if d is not null then perform rpc_cache_put('sales_leaderboard', k, d); end if;
  end if;
  return d;
end $$;
revoke all on function public.sales_leaderboard(date, date, text) from public, anon;
grant execute on function public.sales_leaderboard(date, date, text) to authenticated;

-- ---------- Pay (comp_sales): the saved key includes which rep and whether the person manages pay ----------
create or replace function public.comp_sales(p_year integer, p_emp uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  boss boolean := can_manage_pay();
  who uuid := case when can_manage_pay() then p_emp else my_id() end;
  k text := coalesce(p_year::text, '') || '|' || coalesce(who::text, 'all') || '|' || boss::text;
  d jsonb;
begin
  if my_id() is null then return null; end if;
  d := rpc_cache_get('comp_sales', k);
  if d is null then
    d := comp_sales_calc(p_year, p_emp);
    if d is not null then perform rpc_cache_put('comp_sales', k, d); end if;
  end if;
  return d;
end $$;
revoke all on function public.comp_sales(integer, uuid) from public, anon;
grant execute on function public.comp_sales(integer, uuid) to authenticated;

-- Pay plan edits show right away: forget saved pay when plans or settings change.
create or replace function public.forget_comp_sales()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from rpc_cache where fn = 'comp_sales';
  return null;
end $$;
drop trigger if exists forget_comp_sales on public.comp_assignments;
create trigger forget_comp_sales after insert or update or delete on public.comp_assignments for each statement execute function forget_comp_sales();
drop trigger if exists forget_comp_sales on public.comp_settings;
create trigger forget_comp_sales after insert or update or delete on public.comp_settings for each statement execute function forget_comp_sales();
drop trigger if exists forget_comp_sales on public.comp_service_groups;
create trigger forget_comp_sales after insert or update or delete on public.comp_service_groups for each statement execute function forget_comp_sales();

-- Technician rule edits show right away too.
create or replace function public.forget_tech_scorecard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from rpc_cache where fn = 'tech_scorecard';
  return null;
end $$;
drop trigger if exists forget_tech_scorecard on public.scorecard_rules;
create trigger forget_tech_scorecard after insert or update or delete on public.scorecard_rules for each statement execute function forget_tech_scorecard();

-- Sales Leaderboard excluded service types
create or replace function public.forget_sales_leaderboard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from rpc_cache where fn = 'sales_leaderboard';
  return null;
end $$;
drop trigger if exists forget_sales_leaderboard on public.sales_board_rules;
create trigger forget_sales_leaderboard after insert or update or delete on public.sales_board_rules for each statement execute function forget_sales_leaderboard();

commit;
