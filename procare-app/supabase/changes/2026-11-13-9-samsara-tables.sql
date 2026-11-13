-- 2026-11-13. Samsara driving data, filled by Procare Sync (needs SAMSARA_TOKEN in its Script Properties).
-- Adds tables only. Locked down like the fr_* tables: no read rules until the Tech Scorecard adds them.

begin;

-- Every truck in Samsara.
create table if not exists public.samsara_vehicles (
  vehicle_id text primary key,
  name       text,
  synced_at  timestamptz not null default now()
);

-- Which truck each tech drives. Procare Sync fills this by matching truck names that start with
-- the tech's name ("Adin Sanford -118"). A manager can set one by hand (set_by = 'manual'),
-- and the sync never overwrites those.
create table if not exists public.tech_vehicles (
  employee_id  uuid primary key references public.employees(id) on delete cascade,
  vehicle_id   text,
  vehicle_name text,
  set_by       text not null default 'auto' check (set_by in ('auto', 'manual')),
  updated_at   timestamptz not null default now()
);

-- Dash-cam safety events (distracted driving, rolling stops, following distance, seat belt, speeding).
-- Dismissed and invalid events are left out.
create table if not exists public.samsara_events (
  event_id       text primary key,
  vehicle_id     text,
  event_time     timestamptz,
  labels         text[],
  coaching_state text,
  synced_at      timestamptz not null default now()
);
create index if not exists samsara_events_vehicle_time on public.samsara_events (vehicle_id, event_time);

-- Samsara's safety score per truck for each scorecard period (this week, last week, this month,
-- last month, this year) and the matching earlier period for trend arrows.
-- window_key looks like 'thisMonth:cur' or 'thisMonth:prior'.
create table if not exists public.samsara_scores (
  vehicle_id  text not null,
  window_key  text not null,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  score       integer,
  miles       integer,
  drive_hours numeric(8,1),
  harsh_brake integer,
  harsh_accel integer,
  harsh_turn  integer,
  crash       integer,
  speed_pct   numeric(5,1),   -- % of drive time over the speed limit
  updated_at  timestamptz not null default now(),
  primary key (vehicle_id, window_key)
);

alter table public.fr_sync_runs add column if not exists samsara_calls integer not null default 0;

alter table public.samsara_vehicles enable row level security;
alter table public.tech_vehicles    enable row level security;
alter table public.samsara_events   enable row level security;
alter table public.samsara_scores   enable row level security;

commit;
