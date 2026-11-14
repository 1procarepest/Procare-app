-- 2026-11-13. Score techs by Samsara DRIVER instead of by truck name.
-- A driver's trips stay with that person no matter which truck they drive, so swapped trucks and
-- trucks handed to new hires stop mixing up records. Techs with no Samsara driver yet keep using
-- their truck until a manager sets them up as a driver.

begin;

-- Every driver in Samsara (active and deactivated).
create table if not exists public.samsara_drivers (
  driver_id    text primary key,
  name         text,
  username     text,
  external_ids jsonb,          -- free-form IDs a manager typed in Samsara (for example a FieldRoutes ID)
  active       boolean not null default true,
  synced_at    timestamptz not null default now()
);

-- Which Samsara driver each tech is. Procare Sync matches by an ID in the driver's external IDs that
-- equals one of the tech's FieldRoutes IDs, otherwise by exact full name. A driver ID typed on the
-- person's record (employees.samsara_driver_id) always wins and shows as driver_set_by = 'manual'.
alter table public.tech_vehicles
  add column if not exists driver_id     text,
  add column if not exists driver_name   text,
  add column if not exists driver_set_by text not null default 'auto';
alter table public.tech_vehicles drop constraint if exists tech_vehicles_driver_set_by_check;
alter table public.tech_vehicles add constraint tech_vehicles_driver_set_by_check check (driver_set_by in ('auto', 'manual'));

-- Who was driving when each safety event happened (null = no driver assigned to that trip).
alter table public.samsara_events add column if not exists driver_id text;
create index if not exists samsara_events_driver_time on public.samsara_events (driver_id, event_time);

-- Samsara's safety score per driver for each scorecard period. Same shape as samsara_scores.
create table if not exists public.samsara_driver_scores (
  driver_id   text not null,
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
  speed_pct   numeric(5,1),
  behaviors   jsonb,
  speeding    jsonb,
  updated_at  timestamptz not null default now(),
  primary key (driver_id, window_key)
);

alter table public.samsara_drivers       enable row level security;
alter table public.samsara_driver_scores enable row level security;

-- The score the scorecard uses: the driver's score once a tech is linked to a Samsara driver,
-- otherwise their truck's score. security_invoker keeps the tables' own read rules in force.
create or replace view public.tech_safety_scores with (security_invoker = true) as
select tv.employee_id, s.window_key, 'driver'::text as source, s.score, s.miles, s.drive_hours,
       s.harsh_brake, s.harsh_accel, s.harsh_turn, s.crash, s.speed_pct, s.behaviors, s.speeding, s.updated_at
from public.tech_vehicles tv
join public.samsara_driver_scores s on s.driver_id = tv.driver_id
where tv.driver_id is not null
union all
select tv.employee_id, s.window_key, 'truck', s.score, s.miles, s.drive_hours,
       s.harsh_brake, s.harsh_accel, s.harsh_turn, s.crash, s.speed_pct, s.behaviors, s.speeding, s.updated_at
from public.tech_vehicles tv
join public.samsara_scores s on s.vehicle_id = tv.vehicle_id
where tv.driver_id is null;

commit;
