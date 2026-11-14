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
