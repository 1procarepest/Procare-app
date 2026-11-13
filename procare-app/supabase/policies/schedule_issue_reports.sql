-- Row level security rules and triggers for public.schedule_issue_reports.
--
-- Reference copy exported 2026-11-13. The app doesn't run this file. To change a
-- rule, paste a drop/create block into Supabase → SQL Editor, then update it here.
-- Helper functions (my_id, can_manage, …) are in ../functions.sql.

alter table public.schedule_issue_reports enable row level security;

-- History
--   2026-11-13  issues_update: the President can also resolve their own reports.
--               Before, only someone who manages the reporter could, so nobody
--               could resolve a report the President made.

-- Anyone can report an issue about their own schedule.
create policy issues_insert on public.schedule_issue_reports
  for insert to authenticated
  with check (employee_id = my_id());

-- You see your own reports and reports from people you manage.
create policy issues_read on public.schedule_issue_reports
  for select to authenticated
  using ((employee_id = my_id()) or can_manage(employee_id));

-- Managers resolve reports from people they manage; the President can also resolve
-- their own. (Created without "to authenticated", so it shows as "to public";
-- signed-out visitors still can't match it because my_id() is null for them.)
create policy issues_update on public.schedule_issue_reports
  for update
  using (
    can_manage(employee_id)
    or (
      employee_id = my_id()
      and exists (
        select 1 from public.employees e
        where e.id = my_id() and e.level = 'president'
      )
    )
  )
  with check (true);

create trigger log_schedule_issues
  after insert or delete or update on public.schedule_issue_reports
  for each row execute function log_change();
