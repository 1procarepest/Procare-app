-- 85 (2026-11-22). Inventory count reminder (John): counts are done the last week of every month. On the month's last
-- 2 business days (Mon–Fri, not a company holiday that's switched on), each place whose count isn't finished emails
-- its region's branch managers (the President if none); Wildlife's count at West emails the wildlife manager.
-- Sent by the daily job (lib/inventoryReminder.js). Switch below (Settings → Email settings).
-- Safe to run twice.
insert into public.notification_settings (key, label, enabled) values
  ('inventory_count_reminder', 'Inventory count not finished: email the managers on the last 2 business days of the month', true)
on conflict (key) do nothing;
