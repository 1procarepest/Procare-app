-- 58 (2026-11-19). Two more holiday switches, both off to start: Good Friday and Day after Christmas.
-- Keeps Settings → Holidays in calendar order.

begin;

insert into public.company_holidays (key, name, enabled, sort) values
  ('good_friday',         'Good Friday',         false, 0),
  ('day_after_christmas', 'Day after Christmas', false, 0)
on conflict (key) do nothing;

update public.company_holidays h set sort = o.sort
from (values ('new_years_day', 1), ('mlk_day', 2), ('presidents_day', 3), ('good_friday', 4), ('memorial_day', 5),
             ('juneteenth', 6), ('independence_day', 7), ('labor_day', 8), ('columbus_day', 9), ('veterans_day', 10),
             ('thanksgiving', 11), ('day_after_thanksgiving', 12), ('christmas_eve', 13), ('christmas_day', 14),
             ('day_after_christmas', 15), ('new_years_eve', 16)) as o(key, sort)
where h.key = o.key and h.sort <> o.sort;

commit;

-- Check: every holiday in order, and whether it's on
select name, case when enabled then 'On (day off)' else 'Off' end as status from public.company_holidays order by sort;
