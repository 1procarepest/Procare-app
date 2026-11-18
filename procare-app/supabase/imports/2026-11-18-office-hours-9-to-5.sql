-- 2026-11-18. Office team hours (John).
--   1. Office team default is 9 AM – 5 PM: every office-team weekday set to exactly 9 AM – 6 PM becomes 9 – 5.
--      Any other hours (like Kaitryn's 9 – 4 Monday) stay as they are.
--   2. Ally Boyd: Mon, Tue, Thu, Fri 7:30 AM – 5 PM; Wed 7 AM – 4 PM.
-- Safe to run more than once. The result lists each person and day that changed.
begin;

create temp table hours_changed (name text, weekday int, hours text) on commit drop;

with changed as (
  update schedules s set end_time = time '17:00'
  from employees e
  where e.id = s.employee_id and e.active and e.department = 'administrative'
    and s.start_time = time '09:00' and s.end_time = time '18:00'
    and not (lower(e.first_name) = 'ally' and lower(e.last_name) = 'boyd')
  returning e.first_name || ' ' || e.last_name as name, s.weekday
)
insert into hours_changed select name, weekday, '9 AM – 5 PM' from changed;

with ally as (
  select id, first_name || ' ' || last_name as name from employees
  where lower(first_name) = 'ally' and lower(last_name) = 'boyd' and active
),
want (weekday, start_time, end_time, hours) as (values
  (1, time '07:30', time '17:00', '7:30 AM – 5 PM'), (2, time '07:30', time '17:00', '7:30 AM – 5 PM'),
  (3, time '07:00', time '16:00', '7 AM – 4 PM'),
  (4, time '07:30', time '17:00', '7:30 AM – 5 PM'), (5, time '07:30', time '17:00', '7:30 AM – 5 PM')
),
saved as (
  insert into schedules (employee_id, weekday, start_time, end_time)
  select a.id, w.weekday, w.start_time, w.end_time from ally a cross join want w
  on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time
  returning weekday
)
insert into hours_changed
select (select name from ally), s.weekday, w.hours from saved s join want w using (weekday);

select name, string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[weekday + 1], ', ' order by weekday) as days, hours
from hours_changed group by name, hours order by name, hours;

commit;
