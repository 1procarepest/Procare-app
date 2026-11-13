-- 2026-11-13. The four automatic emails, each with a switch on Manage team → Email settings.
-- Adds rows only; existing rows are left as they are. The last line lists every switch
-- so any old ones that no longer send anything can be spotted and removed.

insert into public.notification_settings (key, label, enabled) values
  ('time_off_request',      'New time-off request: email the HR approver (Ally)', true),
  ('time_off_decision',     'Time off approved or denied: email the employee', true),
  ('sales_time_off_notice', 'Sales time-off notice: email the sales manager (or the President)', true),
  ('schedule_issue',        'Schedule issue or sales schedule update: email whoever handles their schedule', true)
on conflict (key) do nothing;

select key, label, enabled from public.notification_settings order by label;
