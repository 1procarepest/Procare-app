-- 63b (2026-11-19). Step 2 of 2 (run 63a first). Wildlife department (John: a separate department; Bryan Koons and Sam Scott as managers with
-- Wildlife-only access; Jessica Bowles, office, also sees the Wildlife side).
--  1. New department 'wildlife'. Bryan and Sam move to it as managers. Jessica keeps her office job and gets
--     employees.wildlife_access. They keep every technician tool (route, schedule, time off): those don't depend on
--     the department. They don't get the Operations Suite, Settings or the technician leaderboard.
--  2. wildlife_scorecard(period): the Technician Performance Card's numbers for the Wildlife department only (built
--     from the live tech scorecard calculation, so it always has the same columns).
--  3. wildlife_sales(period): Exclusion Service(s), Wildlife Warranty, Trapping and Insulation, sold (count and $)
--     and done (count and $), per person.
--  4. Both are saved for 20 minutes and recalculated in the background every 10 minutes (change 61's job).
-- Safe to run twice.

begin;

-- 1. People and access -------------------------------------------------------------------------------------
alter table public.employees add column if not exists wildlife_access boolean not null default false;

-- The employee guard sets department from the FieldRoutes employee type on every save. Keep 'wildlife' once it's
-- set (FieldRoutes has no Wildlife type); setting someone back to technician/office/sales still follows FieldRoutes.
do $$
declare
  src text := pg_get_functiondef('public.guard_employee()'::regprocedure);
  out text;
begin
  if position('then new.department else case new.fr_employee_type' in src) > 0 then return; end if;   -- already done
  out := replace(src, 'new.department := case new.fr_employee_type',
                      'new.department := case when new.department::text = ''wildlife'' then new.department else case new.fr_employee_type');
  out := replace(out, 'else ''administrative''::public.department end;', 'else ''administrative''::public.department end end;');
  if out = src or (length(out) - length(src)) <> length('case when new.department::text = ''wildlife'' then new.department else ') + 4 then
    raise exception 'Could not update guard_employee safely; nothing changed';
  end if;
  execute out;
end $$;

update public.employees set department = 'wildlife', level = 'manager', updated_at = now()
where active and (
  (lower(trim(first_name)) in ('sam', 'samuel') and lower(trim(last_name)) = 'scott')
  or (lower(trim(first_name)) in ('bryan', 'brian') and lower(trim(last_name)) = 'koons'))
  and (department::text <> 'wildlife' or level::text <> 'manager');

update public.employees set wildlife_access = true, updated_at = now()
where active and lower(trim(first_name)) in ('jessica', 'jess') and lower(trim(last_name)) = 'bowles' and not wildlife_access;

-- Who sees the Wildlife section: the Wildlife department, people given wildlife_access, C-Suite and the President
create or replace function public.can_see_wildlife()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e where e.id = my_id() and e.active
                 and (e.department::text = 'wildlife' or e.wildlife_access or e.level::text in ('c_suite', 'president')))
$$;
revoke all on function public.can_see_wildlife() from public, anon;
grant execute on function public.can_see_wildlife() to authenticated;

-- Operations Suite: not for the Wildlife department (Wildlife-only access)
create or replace function public.can_see_ops()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e
                 where e.id = my_id() and e.active and e.department::text <> 'wildlife'
                   and (e.level <> 'team_member' or e.department = 'administrative'))
$$;

-- Team schedule: C-Suite and the President see Wildlife too; the Wildlife side sees only Wildlife
create or replace function public.team_schedule_depts()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when my_rank() >= 4 then array['sales', 'technician', 'wildlife', 'administrative']
    when my_department()::text = 'wildlife'
      or exists (select 1 from employees e where e.id = my_id() and e.wildlife_access) then array['wildlife']
    when my_department() = 'sales' then array['sales']
    when my_rank() >= 3 then array['technician', 'administrative']
    else array[]::text[]
  end
$$;

-- 2. Wildlife scorecard: the live tech scorecard calculation, for the Wildlife department ------------------
do $$
declare
  src text := pg_get_functiondef('public.tech_scorecard_calc(text)'::regprocedure);
  out text;
begin
  out := replace(src, 'e.department = ''technician''', 'e.department::text = ''wildlife''');
  if out = src then raise exception 'Could not find the technician filter in tech_scorecard_calc'; end if;
  out := replace(out, 'public.tech_scorecard_calc(', 'public.wildlife_scorecard_calc(');
  execute out;
end $$;
revoke all on function public.wildlife_scorecard_calc(text) from public, anon, authenticated;

create or replace function public.wildlife_scorecard(p_period text default 'thisMonth')
returns setof public.tech_scorecard_row language plpgsql volatile security definer set search_path = public as $$
declare
  k text := coalesce(p_period, 'thisMonth');
  d jsonb;
begin
  if not can_see_wildlife() then return; end if;
  d := rpc_cache_get('wildlife_scorecard', k, interval '20 minutes');
  if d is null then
    select coalesce(jsonb_agg(to_jsonb(r)), '[]') into d from wildlife_scorecard_calc(p_period) r;
    perform rpc_cache_put('wildlife_scorecard', k, d);
  end if;
  return query select * from jsonb_populate_recordset(null::public.tech_scorecard_row, d);
end $$;
revoke all on function public.wildlife_scorecard(text) from public, anon;
grant execute on function public.wildlife_scorecard(text) to authenticated;

-- 3. Wildlife services sold and done -----------------------------------------------------------------------
create or replace function public.wildlife_line(name text)
returns text language sql immutable as $$
  select case
    when name ~* 'exclusion' then 'exclusion'
    when name ~* 'wildlife\s*warrant' then 'warranty'
    when name ~* 'trapping' then 'trapping'
    when name ~* 'insulation' then 'insulation'
  end
$$;

create or replace function public.wildlife_sales_calc(p_period text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  per record;
  result jsonb;
begin
  select * into per from scorecard_period(coalesce(p_period, 'thisMonth'));
  with team as materialized (
    select e.id, x.fr_id from employees e cross join lateral unnest(tech_fr_ids(e.id)) as x(fr_id)
    where e.active and e.department::text = 'wildlife'
  ),
  wins as (select 'cur'::text as which, per.cur_start as s, per.cur_end as e
           union all select 'prior', per.prior_start, per.prior_end),
  sold as (
    select t.id, w.which, wildlife_line(s.service_type) as line, count(*) as n, coalesce(sum(s.contract_value), 0) as amt
    from wins w
    join fr_subscriptions s on (s.date_added at time zone 'America/New_York')::date between w.s and w.e
    join team t on t.fr_id = s.sold_by
    where wildlife_line(s.service_type) is not null
    group by 1, 2, 3
  ),
  done as (
    select t.id, w.which, wildlife_line(st.description) as line, count(*) as n, coalesce(sum(a.production_value), 0) as amt
    from wins w
    join fr_appointments a on a.date between w.s and w.e and a.status = 1
    join fr_service_types st on st.office = a.office and st.type_id = a.type_id
    join team t on t.fr_id = coalesce(nullif(a.serviced_by, 0), nullif(a.assigned_tech, 0))
    where wildlife_line(st.description) is not null
    group by 1, 2, 3
  )
  select jsonb_build_object(
    'sold', (select coalesce(jsonb_agg(x), '[]') from sold x),
    'done', (select coalesce(jsonb_agg(x), '[]') from done x),
    'names', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', st.description, 'line', wildlife_line(st.description))), '[]')
              from fr_service_types st where wildlife_line(st.description) is not null)
  ) into result;
  return result;
end $$;
revoke all on function public.wildlife_sales_calc(text) from public, anon, authenticated;

create or replace function public.wildlife_sales(p_period text default 'thisMonth')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  k text := coalesce(p_period, 'thisMonth');
  d jsonb;
begin
  if not can_see_wildlife() then return null; end if;
  d := rpc_cache_get('wildlife_sales', k, interval '20 minutes');
  if d is null then
    d := wildlife_sales_calc(k);
    if d is not null then perform rpc_cache_put('wildlife_sales', k, d); end if;
  end if;
  return d;
end $$;
revoke all on function public.wildlife_sales(text) from public, anon;
grant execute on function public.wildlife_sales(text) to authenticated;

-- 4. Background refresh: add the Wildlife copies ----------------------------------------------------------
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

  -- Wildlife scorecard and wildlife sales (change 63): one saved copy per period name, like the tech scorecard
  for c in select fn, k from rpc_cache where fn in ('wildlife_scorecard', 'wildlife_sales') loop
    begin
      if c.fn = 'wildlife_scorecard' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]') into d from wildlife_scorecard_calc(c.k) r;
      else
        d := wildlife_sales_calc(c.k);
      end if;
      if d is not null then perform rpc_cache_put(c.fn, c.k, d); n := n + 1; end if;
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

-- Check: who is on the Wildlife side, and which FieldRoutes service types count as wildlife
select first_name || ' ' || last_name as who, department::text as department, level::text as level,
       case when wildlife_access then 'sees Wildlife' else '' end as note
from public.employees where active and (department::text = 'wildlife' or wildlife_access)
union all
select 'Service type: ' || name, line, '', '' from (
  select distinct description as name, public.wildlife_line(description) as line
  from public.fr_service_types where public.wildlife_line(description) is not null) s;
