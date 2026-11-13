-- Row level security rules and triggers for public.time_off_requests.
--
-- Reference copy exported 2026-11-13. The app doesn't run this file. To change a
-- rule, paste a drop/create block into Supabase → SQL Editor, then update it here.
-- Helper functions (my_id, can_manage, …) are in ../functions.sql.

alter table public.time_off_requests enable row level security;

-- Who approves time off (can_approve_time_off in ../functions.sql)
--   Sales department: any active sales manager, or the President.
--   Everyone else:    the HR approver (Ally Boyd), or the President.
--   Nobody approves their own request, except the President.
--
-- History
--   2026-11-13  Sales can request time off. Sales requests go to a sales manager or
--               the President instead of HR. Before: insert had
--               "and my_department() <> 'sales'", and read/update used is_hr_approver().

-- Everyone, sales included, can request time off for themselves.
create policy time_off_insert on public.time_off_requests
  for insert to public
  with check (employee_id = my_id());

-- You see your own requests, your team's, and the ones you approve.
create policy time_off_read on public.time_off_requests
  for select to public
  using ((employee_id = my_id()) or can_manage(employee_id) or can_approve_time_off(employee_id));

-- You can cancel your own pending request; approvers decide.
-- guard_time_off() enforces which change each person can make.
create policy time_off_update on public.time_off_requests
  for update to public
  using ((employee_id = my_id()) or can_approve_time_off(employee_id))
  with check (true);

-- New requests always start pending; only approvers can approve or deny.
create trigger time_off_guard
  before insert or update on public.time_off_requests
  for each row execute function guard_time_off();

create trigger log_time_off
  after insert or delete or update on public.time_off_requests
  for each row execute function log_change();
