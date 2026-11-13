-- Row-level security rules for public.schedule_issue_reports.
--
-- This file is a record of what is set in Supabase. The app doesn't run it;
-- changes are made by pasting into Supabase → SQL Editor. Keep this file in step
-- with the database whenever a rule changes.
--
-- Helpers used (defined in Supabase):
--   my_id()            the signed-in person's employees.id
--   can_manage(target) true when the signed-in person manages that employee
--
-- History
--   2026-11-13  issues_update: the President can also resolve their own reports.
--               Before, only someone who manages the reporter could, so nobody
--               could resolve a report the President made.

-- Anyone can report an issue about their own schedule.
-- create policy issues_insert on public.schedule_issue_reports
--   for insert with check (employee_id = my_id());

-- People see their own reports and reports from people they manage.
-- create policy issues_read on public.schedule_issue_reports
--   for select using ((employee_id = my_id()) or can_manage(employee_id));

-- Managers resolve reports from people they manage; the President can also
-- resolve their own. (Applied 2026-11-13.)
begin;

drop policy if exists issues_update on public.schedule_issue_reports;

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

commit;
