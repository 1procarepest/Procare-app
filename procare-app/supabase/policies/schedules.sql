-- Row level security rules and triggers for public.schedules.
--
-- Reference copy exported 2026-11-13. The app doesn't run this file. To change a
-- rule, paste a drop/create block into Supabase → SQL Editor, then update it here.
-- Helper functions (my_id, can_manage, …) are in ../functions.sql.

alter table public.schedules enable row level security;

-- You see your own schedule, your team's, and any you're allowed to edit.
create policy schedules_read on public.schedules
  for select to authenticated
  using ((employee_id = my_id()) or can_manage(employee_id) or can_edit_schedule(employee_id));

-- Changes follow can_edit_schedule(): sales schedules by the person, a sales manager
-- or the President; everyone else's by whoever manages them.
create policy schedules_write on public.schedules
  for all to authenticated
  using (can_edit_schedule(employee_id))
  with check (can_edit_schedule(employee_id));

create trigger log_schedules
  after insert or delete or update on public.schedules
  for each row execute function log_change();
