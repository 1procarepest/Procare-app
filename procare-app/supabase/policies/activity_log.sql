-- Row level security rules and triggers for public.activity_log.
--
-- Reference copy exported 2026-11-13. The app doesn't run this file. To change a
-- rule, paste a drop/create block into Supabase → SQL Editor, then update it here.
-- Helper functions (my_id, can_manage, …) are in ../functions.sql.

alter table public.activity_log enable row level security;

-- C-Suite and the President can read the log. Nobody writes to it directly;
-- log_change() (a trigger on every other table) adds rows.
create policy log_read on public.activity_log
  for select to authenticated
  using (my_rank() >= 4);
