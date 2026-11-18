-- 2026-11-18. Office team default hours are 9 AM – 5 PM (John). Every office-team weekday set to exactly
-- 9 AM – 6 PM becomes 9 AM – 5 PM. Any other hours (like Kaitryn's 9 – 4 Monday) stay as they are.
-- The result lists each person and the days that changed.
begin;

with changed as (
  update schedules s set end_time = time '17:00'
  from employees e
  where e.id = s.employee_id and e.active and e.department = 'administrative'
    and s.start_time = time '09:00' and s.end_time = time '18:00'
  returning e.first_name || ' ' || e.last_name as name, s.weekday
)
select name, string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[weekday + 1], ', ' order by weekday) as days_now_9_to_5
from changed group by name order by name;

commit;
