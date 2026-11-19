-- 2026-11-18. Office team: the two differences in Sling's office shifts that the app didn't have yet (John chose to
-- keep today's 8:30 – 5 office hours and Ally / Rachel / Katie's own hours, and add these):
--   Naomi Zoker  Tuesday and Thursday 8:30 AM – 4 PM (Sling: leaves at 4 PM those days)
--   Jena Spyers  Friday 8 AM – 12:30 PM
-- Time off in the Sling office exports was already imported. Safe to run more than once.
begin;

with want (name, weekday, start_time, end_time) as (values
  ('naomi zoker', 2, time '08:30', time '16:00'),
  ('naomi zoker', 4, time '08:30', time '16:00'),
  ('jena spyers', 5, time '08:00', time '12:30')
),
saved as (
  insert into schedules (employee_id, weekday, start_time, end_time)
  select e.id, w.weekday, w.start_time, w.end_time
  from want w join employees e on e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = w.name
  on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time
  returning employee_id, weekday, start_time, end_time
)
select e.first_name || ' ' || e.last_name as name, (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[s.weekday + 1] as day,
       to_char(s.start_time, 'FMHH12:MI AM') || ' – ' || to_char(s.end_time, 'FMHH12:MI AM') as hours
from saved s join employees e on e.id = s.employee_id order by 1, s.weekday;

commit;
