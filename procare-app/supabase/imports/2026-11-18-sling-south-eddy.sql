-- 2026-11-18. South: Eddy Diop (FieldRoutes ID 73908; "Idrissa Diop" in Sling) works Tue–Sat 9:30 AM – 6:30 PM.
-- Finds him by his FieldRoutes ID or the name Eddy Diop. The result shows his name, office and the hours set;
-- no rows means he isn't in the app yet (Procare Sync adds active FieldRoutes employees).
begin;

with eddy as (
  select e.id, e.first_name, e.last_name, e.office, e.active from employees e
  where e.fr_ids::text ~ '(^|[^0-9])73908([^0-9]|$)' or lower(trim(e.first_name) || ' ' || trim(e.last_name)) in ('eddy diop', 'eddie diop', 'idrissa diop')
  order by e.active desc limit 1
),
want (weekday, start_time, end_time) as (values
  (2, time '09:30', time '18:30'), (3, time '09:30', time '18:30'), (4, time '09:30', time '18:30'),
  (5, time '09:30', time '18:30'), (6, time '09:30', time '18:30')
),
cleared as (
  delete from schedules s using eddy where s.employee_id = eddy.id and s.weekday in (0, 1) returning s.weekday
),
saved as (
  insert into schedules (employee_id, weekday, start_time, end_time)
  select eddy.id, w.weekday, w.start_time, w.end_time from eddy cross join want w
  on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time
  returning weekday
)
select eddy.first_name || ' ' || eddy.last_name as name, eddy.office, eddy.active,
       (select count(*) from saved) || ' days set (Tue–Sat 9:30 AM – 6:30 PM), Sun and Mon off' as result
from eddy;

commit;
