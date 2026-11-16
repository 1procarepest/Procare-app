-- 2026-11-16-47 manager quarterly bonuses, ride-along and follow-behind reports, and tech feedback.
-- The design John agreed is in BONUSES.md. In short:
--   bonus_settings  one row: who gets every report (Ryan), FieldRoutes sources that never count as marketing sales,
--                   and the sliding scale (60% of goal pays 20%, up to 100% pays 100%; optional stretch cap).
--   bonus_plans     each manager's yearly bonus; a quarter pays a quarter of it.
--   bonus_sets      a quarter's goals for one person or several (shared goals), with bonus_members and bonus_goals.
--                   Locked once Ally approves the quarter (approve_bonus_set), which also writes each person's
--                   bonus into competition_awards (competition_id null, award_key 'bonus:<set id>') so it shows in
--                   their Earnings and goes through the same cash out → Ally pays in ADP → marked paid flow.
--   bonus_entries   things logged with proof (Mark's posts, ad spend, projects); count once Ally approves them.
--   field_reports   ride-alongs and follow-behinds. Managers only; techs see their own feedback through my_feedback().
--                   The id is made on the phone, so a form re-sent after a dropped signal is saved once.
--   truck_issues    warning lights and interiors that need attention, open until the tech or a manager marks them fixed.
-- Who runs bonuses (can_manage_bonuses): the HR approver (Ally), C-Suite and the President.

begin;

create or replace function public.can_manage_bonuses()
returns boolean language sql stable security definer set search_path = public as $$
  select is_hr_approver() or my_rank() >= 4
$$;
revoke all on function public.can_manage_bonuses() from public, anon;
grant execute on function public.can_manage_bonuses() to authenticated;

-- ---------- Settings ----------
create table if not exists public.bonus_settings (
  id          integer primary key default 1 check (id = 1),
  report_to   uuid[] not null default '{}',    -- employees who get every ride-along and follow-behind (Ryan Boyd)
  sources_off text[] not null default '{}',    -- FieldRoutes sources that never count as marketing sales
  scale       jsonb not null default '{"floor": 60, "floor_pay": 20, "stretch": false, "cap": 110}'::jsonb,
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now()
);
insert into public.bonus_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Yearly bonus per manager ----------
create table if not exists public.bonus_plans (
  employee_id uuid not null references public.employees(id) on delete cascade,
  year        integer not null check (year between 2024 and 2100),
  amount      numeric not null default 0 check (amount >= 0),
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, year)
);

-- ---------- A quarter's goals ----------
create table if not exists public.bonus_sets (
  id          uuid primary key default gen_random_uuid(),
  year        integer not null check (year between 2024 and 2100),
  quarter     smallint not null check (quarter between 1 and 4),
  name        text not null check (length(trim(name)) > 0),   -- "West service"
  office      text references public.offices(key),            -- null = company-wide numbers
  results     jsonb,                                          -- the final numbers, saved when approved
  approved_at timestamptz,
  approved_by uuid references public.employees(id) on delete set null,
  created_by  uuid references public.employees(id) on delete set null default public.my_id(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bonus_sets_quarter on public.bonus_sets (year, quarter);

create table if not exists public.bonus_members (
  set_id      uuid not null references public.bonus_sets(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  primary key (set_id, employee_id)
);
create index if not exists bonus_members_emp on public.bonus_members (employee_id);

-- kind: what's measured (see lib/bonus.js). start_value null = recorded automatically from the first day.
create table if not exists public.bonus_goals (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.bonus_sets(id) on delete cascade,
  sort        smallint not null default 0,
  kind        text not null check (kind in ('tech_sales', 'office_sales', 'marketing_sales', 'autopay', 'ar_past', 'cancel',
                                            'pool', 'reports', 'cost_per_customer', 'logged', 'project')),
  label       text not null check (length(trim(label)) > 0),
  target      numeric not null,
  start_value numeric,
  weight      numeric not null default 20 check (weight between 0 and 100),   -- % of the quarter's money
  due_date    date,                                                         -- projects
  created_at  timestamptz not null default now()
);
create index if not exists bonus_goals_set on public.bonus_goals (set_id, sort);

create table if not exists public.bonus_entries (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.bonus_goals(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade default public.my_id(),
  day         date not null,
  qty         numeric not null default 1 check (qty >= 0),   -- how many, or dollars for ad spend
  link        text,
  note        text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists bonus_entries_goal on public.bonus_entries (goal_id, day);

-- Bonuses paid through Earnings: once per person per goal set.
create unique index if not exists competition_awards_bonus on public.competition_awards (employee_id, award_key) where competition_id is null;

-- ---------- Bonus helpers ----------
create or replace function public.is_bonus_member(p_set uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bonus_members where set_id = p_set and employee_id = my_id())
$$;
create or replace function public.bonus_set_open(p_set uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bonus_sets where id = p_set and approved_at is null)
$$;
create or replace function public.bonus_goal_set(p_goal uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select set_id from bonus_goals where id = p_goal
$$;
revoke all on function public.is_bonus_member(uuid) from public, anon;
revoke all on function public.bonus_set_open(uuid) from public, anon;
revoke all on function public.bonus_goal_set(uuid) from public, anon;
grant execute on function public.is_bonus_member(uuid) to authenticated;
grant execute on function public.bonus_set_open(uuid) to authenticated;
grant execute on function public.bonus_goal_set(uuid) to authenticated;

-- ---------- Row level security: bonuses ----------
alter table public.bonus_settings enable row level security;
alter table public.bonus_plans    enable row level security;
alter table public.bonus_sets     enable row level security;
alter table public.bonus_members  enable row level security;
alter table public.bonus_goals    enable row level security;
alter table public.bonus_entries  enable row level security;

drop policy if exists bonus_settings_read on public.bonus_settings;
create policy bonus_settings_read on public.bonus_settings for select to authenticated using (my_id() is not null);   -- the scale is needed to score anyone's bonus
drop policy if exists bonus_settings_change on public.bonus_settings;
create policy bonus_settings_change on public.bonus_settings for update to authenticated
  using (can_manage_bonuses()) with check (can_manage_bonuses());

drop policy if exists bonus_plans_read on public.bonus_plans;
create policy bonus_plans_read on public.bonus_plans for select to authenticated
  using (employee_id = my_id() or can_manage_bonuses());
drop policy if exists bonus_plans_write on public.bonus_plans;
create policy bonus_plans_write on public.bonus_plans for all to authenticated
  using (can_manage_bonuses()) with check (can_manage_bonuses());

drop policy if exists bonus_sets_read on public.bonus_sets;
create policy bonus_sets_read on public.bonus_sets for select to authenticated using (can_manage_bonuses() or is_bonus_member(id));
drop policy if exists bonus_sets_add on public.bonus_sets;
create policy bonus_sets_add on public.bonus_sets for insert to authenticated
  with check (can_manage_bonuses() and approved_at is null);
drop policy if exists bonus_sets_change on public.bonus_sets;
create policy bonus_sets_change on public.bonus_sets for update to authenticated
  using (can_manage_bonuses() and approved_at is null) with check (can_manage_bonuses() and approved_at is null);
drop policy if exists bonus_sets_remove on public.bonus_sets;
create policy bonus_sets_remove on public.bonus_sets for delete to authenticated using (can_manage_bonuses() and approved_at is null);

drop policy if exists bonus_members_read on public.bonus_members;
create policy bonus_members_read on public.bonus_members for select to authenticated
  using (can_manage_bonuses() or is_bonus_member(set_id));
drop policy if exists bonus_members_write on public.bonus_members;
create policy bonus_members_write on public.bonus_members for all to authenticated
  using (can_manage_bonuses() and bonus_set_open(set_id)) with check (can_manage_bonuses() and bonus_set_open(set_id));

drop policy if exists bonus_goals_read on public.bonus_goals;
create policy bonus_goals_read on public.bonus_goals for select to authenticated
  using (can_manage_bonuses() or is_bonus_member(set_id));
drop policy if exists bonus_goals_write on public.bonus_goals;
create policy bonus_goals_write on public.bonus_goals for all to authenticated
  using (can_manage_bonuses() and bonus_set_open(set_id)) with check (can_manage_bonuses() and bonus_set_open(set_id));

-- Entries: the people on the goal log their own (pending only); Ally approves with review_bonus_entry().
drop policy if exists bonus_entries_read on public.bonus_entries;
create policy bonus_entries_read on public.bonus_entries for select to authenticated
  using (can_manage_bonuses() or is_bonus_member(bonus_goal_set(goal_id)));
drop policy if exists bonus_entries_add on public.bonus_entries;
create policy bonus_entries_add on public.bonus_entries for insert to authenticated
  with check (employee_id = my_id() and status = 'pending' and reviewed_by is null
              and is_bonus_member(bonus_goal_set(goal_id)) and bonus_set_open(bonus_goal_set(goal_id)));
drop policy if exists bonus_entries_remove on public.bonus_entries;
create policy bonus_entries_remove on public.bonus_entries for delete to authenticated
  using ((employee_id = my_id() and status = 'pending') or can_manage_bonuses());

drop trigger if exists log_bonus_settings on public.bonus_settings;
create trigger log_bonus_settings after insert or delete or update on public.bonus_settings for each row execute function log_change();
drop trigger if exists log_bonus_plans on public.bonus_plans;
create trigger log_bonus_plans after insert or delete or update on public.bonus_plans for each row execute function log_change();
drop trigger if exists log_bonus_sets on public.bonus_sets;
create trigger log_bonus_sets after insert or delete or update on public.bonus_sets for each row execute function log_change();
drop trigger if exists log_bonus_members on public.bonus_members;
create trigger log_bonus_members after insert or delete or update on public.bonus_members for each row execute function log_change();
drop trigger if exists log_bonus_goals on public.bonus_goals;
create trigger log_bonus_goals after insert or delete or update on public.bonus_goals for each row execute function log_change();
drop trigger if exists log_bonus_entries on public.bonus_entries;
create trigger log_bonus_entries after insert or delete or update on public.bonus_entries for each row execute function log_change();

-- Approve or turn down something logged with proof.
create or replace function public.review_bonus_entry(p_id uuid, p_approve boolean, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_bonuses() then return false; end if;
  update bonus_entries set status = case when p_approve then 'approved' else 'rejected' end,
         review_note = nullif(trim(coalesce(p_note, '')), ''), reviewed_by = my_id(), reviewed_at = now()
  where id = p_id and bonus_set_open(bonus_goal_set(goal_id));
  return found;
end $$;
revoke all on function public.review_bonus_entry(uuid, boolean, text) from public, anon;
grant execute on function public.review_bonus_entry(uuid, boolean, text) to authenticated;

-- Lock a finished quarter and pay it. p_results is what the app worked out (lib/bonus.js):
--   {"goals": [...], "people": [{"id": "<employee id>", "amount": 812.50}, ...]}
-- Each person's amount goes into their Earnings (competition_awards) to cash out.
create or replace function public.approve_bonus_set(p_set uuid, p_results jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  s bonus_sets;
  q_end date;
  today date := (now() at time zone 'America/New_York')::date;
begin
  if not can_manage_bonuses() then return false; end if;
  select * into s from bonus_sets where id = p_set and approved_at is null for update;
  if not found then return false; end if;
  q_end := (make_date(s.year, s.quarter * 3 - 2, 1) + interval '3 months - 1 day')::date;
  if today <= q_end then raise exception 'The quarter isn’t over yet.'; end if;
  insert into competition_awards (competition_id, employee_id, award_key, amount, reason)
  select null, (p->>'id')::uuid, 'bonus:' || s.id, round((p->>'amount')::numeric, 2),
         format('Q%s %s bonus · %s', s.quarter, s.year, s.name)
  from jsonb_array_elements(coalesce(p_results->'people', '[]')) p
  where round((p->>'amount')::numeric, 2) > 0
    and exists (select 1 from bonus_members m where m.set_id = s.id and m.employee_id = (p->>'id')::uuid)
  on conflict do nothing;
  update bonus_sets set results = p_results, approved_at = now(), approved_by = my_id(), updated_at = now() where id = s.id;
  return true;
end $$;
revoke all on function public.approve_bonus_set(uuid, jsonb) from public, anon;
grant execute on function public.approve_bonus_set(uuid, jsonb) to authenticated;

-- ---------- The numbers bonuses are scored on ----------
-- Per office, between p_from and p_to (Eastern dates):
--   sales        core sales sold in the period (same core lines as the Operations card)
--   tech_sales   …sold by a technician
--   marketing    …sold to a new customer (added within 30 days before the sale), not by a technician or a
--                door-to-door rep (which also leaves out office upsells to existing customers), and not from a
--                source switched off in bonus_settings
--   cancels      core cancels in the period
--   *_start / *  accounts, valid auto-pay, AR 30+ dollars and the job pool from the office copies at the start
--                and the end (office_kpi_days, saved every morning)
-- 'sources' lists every marketing source with its count, so Ally can switch sources off.
create or replace function public.bonus_numbers_calc(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  hi date := least(p_to, today);
  start_day date;
  end_day date;
  off text[];
  result jsonb;
begin
  select coalesce(sources_off, '{}') into off from bonus_settings where id = 1;
  off := coalesce(off, '{}');
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
  cx as (
    select s.office, count(*)::int as n from fr_subscriptions s
    where hi >= p_from and s.date_cancelled between p_from and hi and ops_line(s.service_type) is not null
      and (coalesce(array_length(s.completed_appointment_ids, 1), 0) > 0 or s.initial_status = 1)
    group by s.office
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'through', case when hi >= p_from then hi end,
    'start_day', start_day, 'end_day', end_day,
    'offices', (select coalesce(jsonb_agg(jsonb_build_object(
        'office', o.key,
        'sales', (select count(*) from sold x where x.office = o.key),
        'tech_sales', (select count(*) from sold x where x.office = o.key and x.type = 1),
        'marketing', (select coalesce(sum(n), 0) from mk where mk.office = o.key and not (mk.source = any (off))),
        'cancels', coalesce((select n from cx where cx.office = o.key), 0),
        'accounts_start', st.accounts, 'ap_start', st.ap_valid, 'ar_past_start', st.ar_past, 'pool_start', st.pool_past,
        'accounts', en.accounts, 'ap_valid', en.ap_valid, 'ar_past', en.ar_past, 'pool_past', en.pool_past) order by o.key), '[]')
      from offices o
      left join office_kpi_days st on st.day = start_day and st.office = o.key
      left join office_kpi_days en on en.day = end_day and en.office = o.key),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'n', n, 'off', source = any (off)) order by n desc), '[]')
      from (select source, sum(n)::int as n from mk group by source) y)
  ) into result;
  return result;
end $$;
revoke all on function public.bonus_numbers_calc(date, date) from public, anon, authenticated;

-- Saved 5 minutes like the other heavy page functions (change 45). Has AR dollars, so only people on a bonus,
-- Operations people and bonus managers can ask.
create or replace function public.bonus_numbers(p_from date, p_to date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  k text := p_from::text || '|' || p_to::text;
  d jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then return null; end if;
  if not (can_manage_bonuses() or can_see_ops() or exists (select 1 from bonus_members where employee_id = my_id())) then return null; end if;
  d := rpc_cache_get('bonus_numbers', k);
  if d is null then
    d := bonus_numbers_calc(p_from, p_to);
    perform rpc_cache_put('bonus_numbers', k, d);
  end if;
  return d;
end $$;
revoke all on function public.bonus_numbers(date, date) from public, anon;
grant execute on function public.bonus_numbers(date, date) to authenticated;

-- Switching a source on or off changes marketing sales: drop the saved numbers.
create or replace function public.bonus_settings_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from rpc_cache where fn = 'bonus_numbers';
  return null;
end $$;
drop trigger if exists bonus_settings_clear_cache on public.bonus_settings;
create trigger bonus_settings_clear_cache after update on public.bonus_settings for each statement execute function bonus_settings_changed();

-- ---------- Ride-alongs and follow-behinds ----------
create table if not exists public.field_reports (
  id             uuid primary key,             -- made on the phone, so a re-sent form is saved once
  kind           text not null check (kind in ('ride_along', 'follow_behind')),
  author_id      uuid not null references public.employees(id) on delete cascade,
  tech_id        uuid not null references public.employees(id) on delete cascade,
  office         text references public.offices(key),   -- the tech's office
  day            date not null,
  customer_id    bigint,                       -- follow-behinds: the FieldRoutes customer and visit
  appointment_id bigint,
  customer       text,                         -- "Jane Smith, Marietta"
  answers        jsonb not null default '{}'::jsonb,   -- manager-only answers (lib/reports.js)
  improve        text[] not null default '{}',         -- Where to improve switches (the tech sees these)
  tech_note      text,                                 -- the manager's note to the tech (the tech sees this)
  told_tech      boolean not null default false,       -- must be on for the report to count toward a bonus
  tech_seen_at   timestamptz,                          -- the tech tapped Got it
  created_at     timestamptz not null default now()
);
create index if not exists field_reports_day on public.field_reports (day);
create index if not exists field_reports_tech on public.field_reports (tech_id, day desc);
create index if not exists field_reports_author on public.field_reports (author_id, day desc);

create table if not exists public.truck_issues (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.field_reports(id) on delete cascade,
  tech_id    uuid not null references public.employees(id) on delete cascade,
  office     text references public.offices(key),
  item       text not null check (length(trim(item)) > 0),   -- "Check engine light", "Interior needs attention"
  status     text not null default 'open' check (status in ('open', 'fixed')),
  fixed_by   uuid references public.employees(id) on delete set null,
  fixed_at   timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists truck_issues_open on public.truck_issues (office, status);
create index if not exists truck_issues_tech on public.truck_issues (tech_id, status);

-- Who fills out reports: technician leads and managers, any non-sales manager, C-Suite and the President.
create or replace function public.can_file_reports()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e where e.id = my_id() and (
       level_rank(e.level) >= 4
    or (e.department = 'technician' and level_rank(e.level) >= 2)
    or (e.department <> 'sales' and e.level = 'manager')))
$$;
-- Who reads reports for an office: C-Suite, the President, Ally, the report recipients (Ryan), technician managers,
-- and technician leads for their own office. Techs never read reports directly (see my_feedback).
create or replace function public.can_see_field_reports(p_office text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e where e.id = my_id() and (
       level_rank(e.level) >= 4 or e.hr_approver
    or e.id = any (coalesce((select report_to from bonus_settings where id = 1), '{}'))
    or (e.department = 'technician' and e.level = 'manager')
    or (e.department = 'technician' and e.level = 'lead' and e.office = p_office)))
$$;
revoke all on function public.can_file_reports() from public, anon;
revoke all on function public.can_see_field_reports(text) from public, anon;
grant execute on function public.can_file_reports() to authenticated;
grant execute on function public.can_see_field_reports(text) to authenticated;

alter table public.field_reports enable row level security;
alter table public.truck_issues  enable row level security;
drop policy if exists field_reports_read on public.field_reports;
create policy field_reports_read on public.field_reports for select to authenticated
  using (author_id = my_id() or can_see_field_reports(office));
drop policy if exists field_reports_remove on public.field_reports;
create policy field_reports_remove on public.field_reports for delete to authenticated
  using (author_id = my_id() or my_rank() >= 4);
-- No direct inserts or updates: submit_field_report(), ack_feedback().
drop policy if exists truck_issues_read on public.truck_issues;
create policy truck_issues_read on public.truck_issues for select to authenticated
  using (tech_id = my_id() or can_see_field_reports(office));
-- No direct writes: submit_field_report(), fix_truck_issue().

drop trigger if exists log_field_reports on public.field_reports;
create trigger log_field_reports after insert or delete or update on public.field_reports for each row execute function log_change();
drop trigger if exists log_truck_issues on public.truck_issues;
create trigger log_truck_issues after insert or delete or update on public.truck_issues for each row execute function log_change();

-- Save a report sent from the form. p: {id, kind, tech_id, day, customer_id, appointment_id, customer, answers,
-- improve [..], tech_note, told_tech, truck_issues [..]}. Returns true when it's new (false when this id was
-- already saved, e.g. sent again after the signal dropped), so emails go out once.
create or replace function public.submit_field_report(p jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_id();
  t employees;
  rid uuid := (p->>'id')::uuid;
  k text := p->>'kind';
  d date := coalesce(nullif(p->>'day', '')::date, (now() at time zone 'America/New_York')::date);
  today date := (now() at time zone 'America/New_York')::date;
  n integer;
begin
  if me is null or not can_file_reports() then raise exception 'Only leads and managers can fill out reports.'; end if;
  if rid is null or k not in ('ride_along', 'follow_behind') then raise exception 'That report is missing something.'; end if;
  if d > today or d < today - 60 then raise exception 'The date has to be in the last 60 days.'; end if;
  select * into t from employees where id = nullif(p->>'tech_id', '')::uuid and department = 'technician';
  if not found then raise exception 'Pick a technician.'; end if;
  insert into field_reports (id, kind, author_id, tech_id, office, day, customer_id, appointment_id, customer,
                             answers, improve, tech_note, told_tech)
  values (rid, k, me, t.id, t.office, d, nullif(p->>'customer_id', '')::bigint, nullif(p->>'appointment_id', '')::bigint,
          nullif(trim(coalesce(p->>'customer', '')), ''), coalesce(p->'answers', '{}'::jsonb),
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'improve', '[]'::jsonb))), '{}'),
          nullif(trim(coalesce(p->>'tech_note', '')), ''), coalesce((p->>'told_tech')::boolean, false))
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into truck_issues (report_id, tech_id, office, item)
  select rid, t.id, t.office, trim(x) from jsonb_array_elements_text(coalesce(p->'truck_issues', '[]'::jsonb)) x
  where length(trim(x)) > 0;
  return true;
end $$;
revoke all on function public.submit_field_report(jsonb) from public, anon;
grant execute on function public.submit_field_report(jsonb) to authenticated;

-- The manager who filed a report talked with the tech afterwards: switch "I told the tech" on (never back off).
create or replace function public.mark_told_tech(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update field_reports set told_tech = true where id = p_id and author_id = my_id() and not told_tech;
  return found;
end $$;
revoke all on function public.mark_told_tech(uuid) from public, anon;
grant execute on function public.mark_told_tech(uuid) to authenticated;

-- The tech tapped Got it on their feedback.
create or replace function public.ack_feedback(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update field_reports set tech_seen_at = now() where id = p_id and tech_id = my_id() and told_tech and tech_seen_at is null;
  return found;
end $$;
revoke all on function public.ack_feedback(uuid) from public, anon;
grant execute on function public.ack_feedback(uuid) to authenticated;

-- Mark a truck item fixed: the tech, or anyone who can see that office's reports.
create or replace function public.fix_truck_issue(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update truck_issues set status = 'fixed', fixed_by = my_id(), fixed_at = now()
  where id = p_id and status = 'open' and (tech_id = my_id() or can_see_field_reports(office));
  return found;
end $$;
revoke all on function public.fix_truck_issue(uuid) from public, anon;
grant execute on function public.fix_truck_issue(uuid) to authenticated;

-- What a tech sees on their landing page: only reports where the manager told them, last 90 days, and only
-- the parts meant for them (Where to improve, the manager's note, a "their favorite" shout-out), plus open
-- truck items. Never the rest of the answers.
create or replace function public.my_feedback()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reports', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'day', r.day, 'from', trim(a.first_name || ' ' || a.last_name),
        'customer', case when r.kind = 'follow_behind' then r.customer end,
        'improve', r.improve, 'note', r.tech_note,
        'favorite', r.kind = 'follow_behind' and (r.answers->>'impression') = '5',
        'seen', r.tech_seen_at is not null) order by r.day desc, r.created_at desc), '[]')
      from field_reports r join employees a on a.id = r.author_id
      where r.tech_id = my_id() and r.told_tech and r.day >= (now() at time zone 'America/New_York')::date - 90),
    'truck', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'item', t.item, 'since', t.created_at) order by t.created_at), '[]')
      from truck_issues t where t.tech_id = my_id() and t.status = 'open')
  )
$$;
revoke all on function public.my_feedback() from public, anon;
grant execute on function public.my_feedback() to authenticated;

-- A tech's completed stops in the last 7 days, for picking a follow-behind. `pick` orders them the same way all
-- day (random, but it doesn't reshuffle on refresh), so the suggested ones can't be re-rolled until a happy one shows.
create or replace function public.recent_stops(p_tech uuid)
returns table (appointment_id bigint, day date, customer_id bigint, customer text, city text, service text,
               termite boolean, autopay boolean, checked boolean, pick integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  today date := (now() at time zone 'America/New_York')::date;
  ids bigint[];
begin
  if not can_file_reports() then return; end if;
  ids := tech_fr_ids(p_tech);
  return query
  select a.appointment_id, a.date, a.customer_id,
         coalesce(nullif(trim(c.company_name), ''), trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '(unknown)'),
         initcap(nullif(trim(c.city), '')),
         coalesce(t.description, ''),
         exists (select 1 from fr_subscriptions s where s.customer_id = a.customer_id and s.active
                 and service_code(s.service_type) in ('TBS', 'TL')),
         coalesce(c.autopay, '') !~* '^(no|0|false|none)?$',
         exists (select 1 from field_reports f where f.kind = 'follow_behind' and f.appointment_id = a.appointment_id),
         (row_number() over (order by md5(a.appointment_id::text || today::text)))::int
  from fr_appointments a
  left join fr_routes rr on rr.route_id = a.route_id
  left join fr_customers c on c.customer_id = a.customer_id
  left join fr_service_types t on t.office = a.office and t.type_id = a.type_id
  where a.status = 1 and a.date between today - 7 and today
    and coalesce(nullif(a.serviced_by, 0), nullif(a.assigned_tech, 0), rr.assigned_tech) = any (ids)
  order by a.date desc, a.appointment_id;
end $$;
revoke all on function public.recent_stops(uuid) from public, anon;
grant execute on function public.recent_stops(uuid) to authenticated;

-- Report counts for bonus pages: who filed what, for which tech, without the answers.
create or replace function public.report_tally(p_from date, p_to date)
returns table (id uuid, kind text, author_id uuid, tech_id uuid, office text, day date, told_tech boolean, improve text[])
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.author_id, r.tech_id, r.office, r.day, r.told_tech, r.improve
  from field_reports r
  where r.day between p_from and p_to
    and (can_manage_bonuses() or can_file_reports() or can_see_field_reports(r.office)
         or exists (select 1 from bonus_members where employee_id = my_id()))
$$;
revoke all on function public.report_tally(date, date) from public, anon;
grant execute on function public.report_tally(date, date) to authenticated;

-- Which of the new menu links someone gets: Reports (fills out or reads reports), Bonus (on a bonus, or runs them).
create or replace function public.my_bonus_links()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reports', can_file_reports() or can_see_field_reports(null),
    'bonus', can_manage_bonuses() or exists (select 1 from bonus_members where employee_id = my_id()),
    'manage', can_manage_bonuses())
$$;
revoke all on function public.my_bonus_links() from public, anon;
grant execute on function public.my_bonus_links() to authenticated;

insert into public.notification_settings (key, label, enabled) values
  ('field_report',   'Ride-along or follow-behind filed: email the report recipients (Ryan)', true),
  ('truck_issue',    'Truck warning light or interior needs attention: email the office’s branch managers', true),
  ('low_score',      'Follow-behind customer Upset or Let down: email the office’s branch managers', true),
  ('bonus_entry',    'Bonus proof logged: email the HR approver (Ally) to approve it', true)
on conflict (key) do nothing;

commit;
