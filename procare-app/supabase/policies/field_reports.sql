-- Row level security for field_reports and truck_issues (change 2026-11-16-47).
-- Managers read reports through can_see_field_reports(office); techs never read them directly, only their
-- own feedback through my_feedback(). Reports come in through submit_field_report(). Every change is logged.

alter table public.field_reports enable row level security;
alter table public.truck_issues  enable row level security;
drop policy if exists field_reports_read on public.field_reports;
create policy field_reports_read on public.field_reports for select to authenticated
  using (author_id = my_id() or can_see_field_reports(office));
drop policy if exists field_reports_remove on public.field_reports;
create policy field_reports_remove on public.field_reports for delete to authenticated
  using (author_id = my_id() or my_rank() >= 4);
-- No direct inserts or updates: submit_field_report(), ack_feedback().
drop policy if exists truck_issues_read on public.truck_issues;
create policy truck_issues_read on public.truck_issues for select to authenticated
  using (tech_id = my_id() or can_see_field_reports(office));
-- No direct writes: submit_field_report(), fix_truck_issue().

drop trigger if exists log_field_reports on public.field_reports;
create trigger log_field_reports after insert or delete or update on public.field_reports for each row execute function log_change();
drop trigger if exists log_truck_issues on public.truck_issues;
create trigger log_truck_issues after insert or delete or update on public.truck_issues for each row execute function log_change();
