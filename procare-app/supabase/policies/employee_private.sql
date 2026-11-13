-- Row level security rules and triggers for public.employee_private.
--
-- Reference copy exported 2026-11-13. The app doesn't run this file. To change a
-- rule, paste a drop/create block into Supabase → SQL Editor, then update it here.
-- Helper functions (my_id, can_manage, …) are in ../functions.sql.

alter table public.employee_private enable row level security;

-- Home addresses: read and edited only by people can_see_private() allows
-- (C-Suite, the President, office managers, office leads for their own office).
create policy private_all on public.employee_private
  for all to authenticated
  using (can_see_private(employee_id))
  with check (can_see_private(employee_id));

create trigger log_employee_private
  after insert or delete or update on public.employee_private
  for each row execute function log_change();
