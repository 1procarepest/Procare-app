-- Repair (2026-11-22): Maintenance said "column t.odometer does not exist". The table parts of change 82 aren't in the
-- database (the functions are). This adds just those parts again; it doesn't touch the functions from change 83.
-- Safe to run twice.
begin;
alter table public.truck_log add column if not exists service text;
alter table public.truck_log drop constraint if exists truck_log_service_check;
alter table public.truck_log add constraint truck_log_service_check check (service is null or service in ('oil', 'tires', 'brakes', 'inspection', 'other'));
update public.truck_log set service = 'oil' where kind = 'maintenance' and service is null and text ~* '\moil\M';
alter table public.trucks add column if not exists odometer integer;
alter table public.trucks add column if not exists odometer_at timestamptz;
alter table public.fleet_settings add column if not exists oil_every_miles integer not null default 5000 check (oil_every_miles > 0);
alter table public.fleet_settings add column if not exists oil_every_months integer not null default 6 check (oil_every_months > 0);
insert into public.notification_settings (key, label, enabled) values
  ('oil_change_reminder', 'Oil changes due or overdue: email each office’s branch managers on Monday mornings', true)
on conflict (key) do nothing;
commit;
notify pgrst, 'reload schema';
select (select count(*) from information_schema.columns where table_name = 'trucks' and column_name in ('odometer', 'odometer_at')) as truck_columns_now;
