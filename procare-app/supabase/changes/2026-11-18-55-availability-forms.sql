-- 2026-11-18 (change 55). Employee Availability Form, filled out in the app instead of on paper.
-- Each submission is kept on the person (their file), Ally (HR approver) gets an email, and the person page can
-- fill the weekly schedule from it.
--   days: { "1": { "a": {"kind": "all" | "hours" | "off", "s": "08:45", "e": "14:00"},
--                  "b": same shape or null (every other week) }, … "6" }   weekday 0 Sunday … 6 Saturday
begin;

create table if not exists public.availability_forms (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  location     text,
  position     text,
  days         jsonb not null,
  notes        text,
  signature    text not null check (length(trim(signature)) > 1),
  submitted_at timestamptz not null default now(),
  applied_at   timestamptz,                              -- when the schedule was set from it
  applied_by   uuid references public.employees(id) on delete set null
);
create index if not exists availability_forms_person on public.availability_forms (employee_id, submitted_at desc);

alter table public.availability_forms enable row level security;
-- You fill out your own.
drop policy if exists availability_forms_insert on public.availability_forms;
create policy availability_forms_insert on public.availability_forms for insert to authenticated
  with check (employee_id = my_id());
-- You, your managers, schedule editors and HR see them.
drop policy if exists availability_forms_read on public.availability_forms;
create policy availability_forms_read on public.availability_forms for select to authenticated
  using (employee_id = my_id() or can_manage(employee_id) or can_edit_schedule(employee_id) or is_hr_approver());
-- Schedule editors and HR mark them as entered.
drop policy if exists availability_forms_update on public.availability_forms;
create policy availability_forms_update on public.availability_forms for update to authenticated
  using (can_edit_schedule(employee_id) or is_hr_approver())
  with check (can_edit_schedule(employee_id) or is_hr_approver());

drop trigger if exists log_availability_forms on public.availability_forms;
create trigger log_availability_forms after insert or delete or update on public.availability_forms
  for each row execute function log_change();

insert into public.notification_settings (key, label, enabled) values
  ('availability_form', 'Availability form filled out: email the HR approver (Ally) to update the schedule', true)
on conflict (key) do nothing;

commit;
