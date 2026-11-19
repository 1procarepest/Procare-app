-- 2026-11-19. Eddy Diop, once Procare Sync has added him (his email is now on all three FieldRoutes accounts;
-- South ID 1209). He is a South tech: the East/West logins only let him see those schedules when he helps out.
-- Sets his office to South and his hours to Tue-Sat 9:30 AM - 6:30 PM, Sun and Mon off.
-- One statement, so Supabase shows the result. No rows = the sync hasn't added him yet; run it again later.
with eddy as (
  select e.id from employees e
  where e.fr_ids ->> 'south' = '1209'
     or lower(trim(e.last_name)) = 'diop'
  order by (e.fr_ids ->> 'south' = '1209') desc nulls last, e.active desc
  limit 1
),
moved as (
  update employees e set office = 'south', updated_at = now()
  from eddy where e.id = eddy.id
  returning e.id, e.first_name, e.last_name, e.office, e.active, e.fr_ids
),
cleared as (
  delete from schedules s using eddy where s.employee_id = eddy.id and s.weekday in (0, 1) returning s.weekday
),
saved as (
  insert into schedules (employee_id, weekday, start_time, end_time)
  select eddy.id, w.d, time '09:30', time '18:30' from eddy cross join (values (2), (3), (4), (5), (6)) as w(d)
  on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time
  returning weekday
)
select m.first_name || ' ' || m.last_name as name, m.office, m.active, m.fr_ids::text as fieldroutes_ids,
       (select count(*) from saved) || ' days set: Tue-Sat 9:30 AM - 6:30 PM, Sun and Mon off' as result
from moved m;
