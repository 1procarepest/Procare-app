-- Tables, columns, types and constraints in Supabase (schema: public).
--
-- Reference copy exported 2026-11-13. The app doesn't run this file.
-- Every table has row level security switched on; the rules are in policies/.
-- Helper functions are in functions.sql.

-- ---------- Types ----------

create type public.department     as enum ('technician', 'sales', 'administrative');
create type public.level          as enum ('team_member', 'lead', 'manager', 'c_suite', 'president');
create type public.issue_status   as enum ('open', 'resolved');
create type public.request_status as enum ('pending', 'approved', 'denied', 'cancelled');

-- ---------- Offices ----------

create table public.offices (
  key          text primary key,               -- 'east', 'west', 'south'
  name         text not null unique,           -- 'Atlanta East' …
  fr_office_id integer                         -- FieldRoutes office id
);

-- ---------- Employees ----------
-- Kept in step with FieldRoutes by Procare Sync (sync/ProcareSync.gs, syncTeam_) once TEAM_SYNC is on:
-- new hires are added, people inactive in FieldRoutes are deactivated (deactivated_by 'sync').
-- deactivated_by 'person' = switched off in the app; the sync never turns those back on.
-- department is set from fr_employee_type by guard_employee(): 2 sales, 1 technician, else administrative.

create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid unique references auth.users(id) on delete set null,
  email             text not null unique,
  first_name        text not null,
  last_name         text not null default '',
  phone             text,
  photo_url         text,
  office            text references public.offices(key),
  department        public.department not null default 'administrative',
  level             public.level not null default 'team_member',
  hr_approver       boolean not null default false,
  active            boolean not null default true,
  deactivated_by    text check (deactivated_by in ('sync', 'person')),
  fr_employee_type  smallint not null default 0,
  fr_ids            jsonb not null default '{}'::jsonb,
  samsara_driver_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Home addresses, kept apart from employees so only HR-type roles can read them.
create table public.employee_private (
  employee_id  uuid primary key references public.employees(id) on delete cascade,
  home_address text,
  updated_at   timestamptz not null default now()
);

-- ---------- Schedules ----------
-- One row per person per weekday (0 Sunday … 6 Saturday). Both times null = day off.

create table public.schedules (
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday     smallint not null check (weekday >= 0 and weekday <= 6),
  start_time  time,
  end_time    time,
  primary key (employee_id, weekday),
  check ((start_time is null and end_time is null) or start_time < end_time)
);

-- ---------- Time off ----------

create table public.time_off_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  start_time    time,                  -- part of a day: both times set, one day only
  end_time      time,                  -- both empty = full days
  use_pto       boolean not null default false,  -- wants paid time off (never for sales)
  note          text,
  status        public.request_status not null default 'pending',
  decision_note text,
  decided_by    uuid references public.employees(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date),
  constraint time_off_partial_day check (
       (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null
        and start_time < end_time and start_date = end_date)
  )
);

-- ---------- Schedule issues ----------

create table public.schedule_issue_reports (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  message     text not null,
  status      public.issue_status not null default 'open',
  resolved_by uuid references public.employees(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- Email settings ----------
-- On/off switches for automatic emails. Nothing sends emails yet.

create table public.notification_settings (
  key        text primary key,
  label      text not null,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- Activity log ----------
-- Every insert, update and delete on the tables above, written by log_change().

create table public.activity_log (
  id         bigserial primary key,
  actor_id   uuid,                 -- employees.id of who did it; null for imports and the SQL editor
  action     text not null,        -- 'insert', 'update', 'delete'
  table_name text not null,
  record_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Route plan (change 2026-11-14-28) ----------
-- Office's usual template/office per tech and weekday, one-day changes, and when a month was built.
create table public.route_plan_usual (
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 6),
  template    text not null check (length(trim(template)) > 0),
  office      text references public.offices(key),
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, weekday)
);
create table public.route_plan_days (
  employee_id uuid not null references public.employees(id) on delete cascade,
  day         date not null,
  template    text not null check (length(trim(template)) > 0),
  office      text references public.offices(key),
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, day)
);
create table public.route_plan_builds (
  office   text not null references public.offices(key),
  month    date not null check (extract(day from month) = 1),
  built_at timestamptz not null default now(),
  built_by uuid references public.employees(id) default public.my_id(),
  primary key (office, month)
);

-- ---------- Sales pay plans (change 2026-11-15-32) ----------
-- Settings (one row), service types that pay, and each rep's plan per year. Shadow mode only.
create table public.comp_settings (
  id             integer primary key default 1 check (id = 1),
  upfront        numeric not null default 100 check (upfront >= 0),
  hold_pct       numeric not null default 20 check (hold_pct between 0 and 100),
  past_due_days  integer not null default 60 check (past_due_days >= 0),
  clawback_days  integer not null default 365 check (clawback_days >= 0),
  flat_pest      numeric not null default 200 check (flat_pest >= 0),
  flat_termite   numeric not null default 150 check (flat_termite >= 0),
  flat_mosquito  numeric not null default 100 check (flat_mosquito >= 0),
  termite_initial_pct numeric not null default 100 check (termite_initial_pct between 0 and 100),  -- change 34
  bonus          jsonb not null default '[{"min":600,"rate":60},{"min":780,"rate":65},{"min":1080,"rate":70}]',
  scales         jsonb not null default '{"first_year":{"name":"First year","start":25,"step":2,"every":50,"max":50},"experienced":{"name":"Experienced","start":30,"step":3,"every":50,"max":50}}',
  updated_by     uuid references public.employees(id) default public.my_id(),
  updated_at     timestamptz not null default now()
);
create table public.comp_service_groups (
  service_type text primary key,
  grp          text not null check (grp in ('pest', 'termite', 'mosquito'))
);
create table public.comp_assignments (
  employee_id uuid not null references public.employees(id) on delete cascade,
  year        integer not null check (year between 2024 and 2100),
  plan        text not null check (plan in ('commission', 'flat')),
  scale       text not null default 'first_year',
  upfront     numeric check (upfront >= 0),        -- blank = the plan's up-front amount
  start_rate  numeric check (start_rate between 0 and 100),
  step_rate   numeric check (step_rate between 0 and 100),
  note        text,
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, year)
);

-- ---------- Competitions (change 2026-11-15-39) ----------
-- Leaderboards and brackets scored with points set per competition. Offices and teams rank by average per member.
create table public.competitions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  style       text not null default 'leaderboard' check (style in ('leaderboard', 'bracket', 'kpi')),   -- change 42 adds kpi
  compete_as  text not null default 'people' check (compete_as in ('people', 'offices', 'teams')),
  departments text[] not null check (cardinality(departments) > 0 and departments <@ array['technician', 'sales', 'administrative']),
  start_date  date not null,
  end_date    date not null,
  round_days  integer check (round_days is null or round_days between 1 and 90),   -- brackets: days per round
  prize       text,
  points      jsonb not null default '{"sale": 3, "autopay": 2, "review": 1, "review_stars": 5, "service": 0, "tiers": [{"over": 420, "pts": 0.5}]}'::jsonb,  -- change 40 adds service, tiers
  seed_end    date,                                  -- change 41: brackets: last day of seeding
  team_size   integer not null default 1 check (team_size between 1 and 6),   -- brackets: 1 = person vs. person, else teams made from seeding
  locked_at   timestamptz,                           -- brackets: when seeds (and teams) were saved on competition_members
  created_by  uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 400),
  constraint competitions_bracket check (style = 'leaderboard'
    or (seed_end is not null and round_days is not null and seed_end >= start_date and seed_end < end_date))
);

create table public.competition_members (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  team           text,      -- custom teams: the team name
  seed           integer,   -- brackets: seeding order (1 = top seed)
  primary key (competition_id, employee_id)
);
create index competition_members_emp on public.competition_members (employee_id);

-- ---------- Office KPI history (change 2026-11-15-42) ----------
-- A copy of each office's numbers every morning, saved by snapshot_routes() → save_office_kpis(). Used by office KPI competitions.
create table public.office_kpi_days (
  day       date not null,                 -- saved that morning (= end of the day before)
  office    text not null,
  accounts  integer not null default 0,    -- recurring accounts
  ap_valid  integer not null default 0,    -- of those, on valid auto-pay
  ar        numeric not null default 0,    -- total AR
  ar_past   numeric not null default 0,    -- AR 30+ days past due
  pool_past integer not null default 0,    -- past-due jobs not on the schedule
  saved_at  timestamptz not null default now(),
  primary key (day, office)
);

-- ---------- Competition prizes and cash outs (change 2026-11-15-43) ----------
-- competitions also has: payouts jsonb (places / rounds), settled_at timestamptz.
create table public.payout_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  amount       numeric not null check (amount > 0),
  status       text not null default 'requested' check (status in ('requested', 'paid')),
  requested_at timestamptz not null default now(),
  paid_at      timestamptz,
  paid_by      uuid references public.employees(id) on delete set null,
  note         text
);

create table public.competition_awards (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions(id) on delete set null,   -- earnings stay if a competition is deleted
  employee_id    uuid not null references public.employees(id) on delete cascade,
  award_key      text not null,                -- 'place' or 'round-0', 'round-1' …
  amount         numeric not null check (amount > 0),
  reason         text not null,                -- "1st place · November Blitz"
  payout_id      uuid references public.payout_requests(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (competition_id, employee_id, award_key)
);

-- ---------- Competition standings cache (change 2026-11-16-44) ----------
-- competition_board() keeps each result 5 minutes here; triggers drop it when the competition or its members change.
create table public.competition_board_cache (
  competition_id uuid primary key references public.competitions(id) on delete cascade,
  data           jsonb not null,
  computed_at    timestamptz not null default now()
);

-- ---------- Saved results for heavy page functions (change 2026-11-16-45) ----------
create table public.rpc_cache (
  fn text not null, k text not null, data jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (fn, k)
);

-- ---------- Quarterly bonuses, ride-alongs and follow-behinds (change 2026-11-16-47) ----------
-- See BONUSES.md. competition_awards also gets a unique index on (employee_id, award_key) where competition_id is null,
-- for approved bonuses (award_key 'bonus:<set id>').
create table public.bonus_settings (
  id          integer primary key default 1 check (id = 1),
  report_to   uuid[] not null default '{}',    -- employees who get every ride-along and follow-behind (Ryan Boyd)
  sources_off text[] not null default '{}',    -- FieldRoutes sources that never count as marketing sales
  cancel_reasons_skip text[] not null default '{}',  -- cancel reasons left out of the bonus cancellation rate (change 51)
  scale       jsonb not null default '{"floor": 60, "floor_pay": 20, "stretch": false, "cap": 110}'::jsonb,
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now()
);

create table public.bonus_plans (
  employee_id uuid not null references public.employees(id) on delete cascade,
  year        integer not null check (year between 2024 and 2100),
  amount      numeric not null default 0 check (amount >= 0),
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, year)
);

create table public.bonus_sets (
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

create table public.bonus_members (
  set_id      uuid not null references public.bonus_sets(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  primary key (set_id, employee_id)
);

create table public.bonus_goals (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.bonus_sets(id) on delete cascade,
  sort        smallint not null default 0,
  kind        text not null check (kind in ('tech_sales', 'office_sales', 'marketing_sales', 'autopay', 'ar_past', 'cancel', 'resv', 'resv_count',
                                            'pool', 'reports', 'cost_per_customer', 'logged', 'project')),
  label       text not null check (length(trim(label)) > 0),
  target      numeric not null,
  start_value numeric,
  weight      numeric not null default 20 check (weight between 0 and 100),   -- % of the quarter's money
  due_date    date,                                                         -- projects
  created_at  timestamptz not null default now()
);

create table public.bonus_entries (
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

create table public.field_reports (
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
  tech_praise    text,                                 -- change 48: the manager's "What they did well" (the tech sees this)
  tech_note      text,                                 -- the manager's note to the tech (the tech sees this)
  told_tech      boolean not null default false,       -- must be on for the report to count toward a bonus
  tech_seen_at   timestamptz,                          -- the tech tapped Got it
  created_at     timestamptz not null default now()
);

create table public.truck_issues (
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

-- ---------- Every-other-week schedules (change 2026-11-18-54) ----------
create table public.schedule_rotations (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  a_week      date not null check (extract(isodow from a_week) = 1),   -- a Monday that starts a week A
  updated_at  timestamptz not null default now()
);
create table public.schedule_alt (                                    -- week-B hours, only the days that differ
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time,                                                  -- both empty = off that day on week B
  end_time    time,
  primary key (employee_id, weekday),
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time < end_time))
);
