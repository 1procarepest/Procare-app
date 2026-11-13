-- 2026-11-13. Tidy the Email settings switches after 2026-11-13-5.
-- Removes two older switches that duplicate the new ones and never sent anything,
-- and gives the switches the app uses clear labels. payout_submitted stays (future
-- incentive payouts).

begin;

delete from public.notification_settings where key in ('time_off_submitted', 'time_off_decided');

update public.notification_settings set label = 'Schedule issue: email their lead or manager'
  where key = 'schedule_issue';
update public.notification_settings set label = 'Sales schedule update: email the sales manager (or the President)'
  where key = 'sales_schedule_change';

commit;

select key, label, enabled from public.notification_settings order by label;
