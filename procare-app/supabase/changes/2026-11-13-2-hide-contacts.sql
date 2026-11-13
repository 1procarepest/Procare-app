-- Step 2 of 2 (2026-11-13). Run only after the app update that reads email and phone
-- through employee_contacts() is live; the old app reads those columns directly.
--
-- Signed-in people can no longer read employees.email or employees.phone directly.
-- They get them through employee_contacts() instead, which gives team members only
-- their own and leads and up everyone's. Every other column stays readable as before
-- (row level security still decides which rows).
--
-- Unaffected: the secret (service role) key used by the passcode API and imports,
-- and the database's own functions, which run as the owner.
--
-- If a new column is added to employees later, grant it too, for example:
--   grant select (new_column) on public.employees to authenticated;

begin;

revoke select on public.employees from anon, authenticated;

grant select (
  id, auth_user_id, first_name, last_name, photo_url, office, department, level,
  hr_approver, active, fr_employee_type, fr_ids, samsara_driver_id, created_at, updated_at
) on public.employees to authenticated;

commit;
