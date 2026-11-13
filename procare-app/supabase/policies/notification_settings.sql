-- Row level security rules and triggers for public.notification_settings.
--
-- Reference copy exported 2026-11-13. The app doesn't run this file. To change a
-- rule, paste a drop/create block into Supabase → SQL Editor, then update it here.
-- Helper functions (my_id, can_manage, …) are in ../functions.sql.

alter table public.notification_settings enable row level security;

-- Everyone can read the email switches; only C-Suite and the President can flip them.
create policy notif_read on public.notification_settings
  for select to authenticated
  using (true);

create policy notif_write on public.notification_settings
  for update to authenticated
  using (my_rank() >= 4)
  with check (my_rank() >= 4);

create trigger log_notifications
  after insert or delete or update on public.notification_settings
  for each row execute function log_change();
