-- 2026-11-19. Eddy Diop is "Idrissa Diop" in the app (East/West FieldRoutes accounts) but "Eddy Diop" in South
-- FieldRoutes (ID 1209, no email), so the sync never linked them. This links South ID 1209 to his app account,
-- moves him to the South office and sets his South hours: Tue–Sat 9:30 AM – 6:30 PM, Sun and Mon off.
-- One statement, so the result table shows. No rows back = nobody named Diop/Idrissa in the app.
with eddy as (
  select e.id from employees e
  where e.last_name ilike '%diop%' or e.first_name ilike '%idrissa%' or e.first_name ilike 'edd%diop%'
  order by e.active desc, e.updated_at desc limit 1
),
linked as (
  update employees e set fr_ids = e.fr_ids || '{"south": 1209}'::jsonb, office = 'south', updated_at = now()
  from eddy where e.id = eddy.id
  returning e.id, e.first_name, e.last_name, e.office, e.active, e.fr_ids
),
want (weekday) as (values (2), (3), (4), (5), (6)),
cleared as (
  delete from schedules s using eddy where s.employee_id = eddy.id and s.weekday in (0, 1) returning s.weekday
),
saved as (
  insert into schedules (employee_id, weekday, start_time, end_time)
  select eddy.id, w.weekday, time '09:30', time '18:30' from eddy cross join want w
  on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time
  returning weekday
)
select l.first_name || ' ' || l.last_name as name, l.office, l.active, l.fr_ids::text as fieldroutes_ids,
       (select count(*) from saved) || ' days set (Tue–Sat 9:30 AM – 6:30 PM), Sun and Mon off' as result
from linked l;
