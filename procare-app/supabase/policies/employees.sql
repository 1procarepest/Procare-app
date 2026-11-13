-- Row level security rules and triggers for public.employees.
--
-- Reference copy exported 2026-11-13. The app doesn't run this file. To change a
-- rule, paste a drop/create block into Supabase → SQL Editor, then update it here.
-- Helper functions (my_id, can_manage, …) are in ../functions.sql.

alter table public.employees enable row level security;

-- History
--   2026-11-13  Email and phone hidden from direct reads. Signed-in people can read
--               every other column; email and phone come from employee_contacts()
--               (team members: their own only; leads and up: everyone).

-- Column access. Row level security below still decides which rows.
-- When adding a column to employees, grant it here too or the app can't read it.
revoke select on public.employees from anon, authenticated;
grant select (
  id, auth_user_id, first_name, last_name, photo_url, office, department, level,
  hr_approver, active, fr_employee_type, fr_ids, samsara_driver_id, created_at, updated_at
) on public.employees to authenticated;

-- Every signed-in person can see active employees, plus themselves and anyone they manage.
create policy employees_read on public.employees
  for select to authenticated
  using (active or (id = my_id()) or can_manage(id));

-- Managers and up can add people; guard_employee() limits what they can set.
create policy employees_insert on public.employees
  for insert to authenticated
  with check (my_rank() >= 3);

-- You can update yourself (phone and photo only) and people you manage.
-- guard_employee() enforces the details.
create policy employees_update on public.employees
  for update to authenticated
  using ((id = my_id()) or can_manage(id))
  with check (true);

-- Only C-Suite and the President can delete, and only people they manage.
create policy employees_delete on public.employees
  for delete to authenticated
  using ((my_rank() >= 4) and can_manage(id));

create trigger employees_guard
  before insert or update on public.employees
  for each row execute function guard_employee();

-- New people get Monday–Friday, 9 AM – 6 PM.
create trigger employees_default_schedule
  after insert on public.employees
  for each row execute function default_schedule();

create trigger log_employees
  after insert or delete or update on public.employees
  for each row execute function log_change();
