-- 2026-11-18. Atlanta West technicians' weekly hours from Sling (shift exports, Nov 2 – Dec 31, 2026).
-- Each person's usual hours per weekday (the same every week in Sling; holidays and time off left out).
-- Sets all seven days for each person: a day they don't work in Sling is set to off.
-- Time off was imported separately (2026-11-18-sling-time-off-west.sql). Safe to run more than once.
-- The result lists each person, the days and the hours; "no match" means check the name in People.
begin;

create temp table set_hours (name text, weekday int, start_time time, end_time time) on commit drop;
insert into set_hours values
  ('Adam Townsend', 0, null, null),
  ('Adam Townsend', 1, time '08:00', time '18:00'),
  ('Adam Townsend', 2, time '08:00', time '18:00'),
  ('Adam Townsend', 3, time '08:00', time '18:00'),
  ('Adam Townsend', 4, time '08:00', time '18:00'),
  ('Adam Townsend', 5, time '08:00', time '18:00'),
  ('Adam Townsend', 6, time '08:00', time '18:00'),
  ('Branden Logan', 0, null, null),
  ('Branden Logan', 1, time '09:00', time '17:00'),
  ('Branden Logan', 2, time '09:00', time '17:00'),
  ('Branden Logan', 3, time '09:00', time '17:00'),
  ('Branden Logan', 4, time '09:00', time '17:00'),
  ('Branden Logan', 5, time '09:00', time '17:00'),
  ('Branden Logan', 6, null, null),
  ('Brandon Byram', 0, null, null),
  ('Brandon Byram', 1, time '08:00', time '17:00'),
  ('Brandon Byram', 2, time '08:00', time '17:00'),
  ('Brandon Byram', 3, time '08:00', time '17:00'),
  ('Brandon Byram', 4, time '08:00', time '17:00'),
  ('Brandon Byram', 5, time '08:00', time '17:00'),
  ('Brandon Byram', 6, null, null),
  ('Carlos Finch', 0, null, null),
  ('Carlos Finch', 1, time '09:00', time '17:00'),
  ('Carlos Finch', 2, time '09:00', time '17:00'),
  ('Carlos Finch', 3, time '09:00', time '17:00'),
  ('Carlos Finch', 4, time '09:00', time '17:00'),
  ('Carlos Finch', 5, time '09:00', time '17:00'),
  ('Carlos Finch', 6, null, null),
  ('Jacari Harris', 0, null, null),
  ('Jacari Harris', 1, time '09:00', time '17:00'),
  ('Jacari Harris', 2, time '09:00', time '17:00'),
  ('Jacari Harris', 3, time '09:00', time '17:00'),
  ('Jacari Harris', 4, time '09:00', time '17:00'),
  ('Jacari Harris', 5, time '09:00', time '17:00'),
  ('Jacari Harris', 6, null, null),
  ('KC Todd', 0, null, null),
  ('KC Todd', 1, time '09:00', time '18:00'),
  ('KC Todd', 2, time '09:00', time '18:00'),
  ('KC Todd', 3, time '09:00', time '18:00'),
  ('KC Todd', 4, time '09:00', time '18:00'),
  ('KC Todd', 5, time '09:00', time '18:00'),
  ('KC Todd', 6, null, null),
  ('Mark Oldfield', 0, null, null),
  ('Mark Oldfield', 1, time '08:00', time '17:00'),
  ('Mark Oldfield', 2, time '08:00', time '17:00'),
  ('Mark Oldfield', 3, time '08:00', time '17:00'),
  ('Mark Oldfield', 4, time '08:00', time '17:00'),
  ('Mark Oldfield', 5, time '08:00', time '17:00'),
  ('Mark Oldfield', 6, null, null),
  ('Michael Rucker', 0, null, null),
  ('Michael Rucker', 1, time '08:00', time '17:00'),
  ('Michael Rucker', 2, time '08:00', time '17:00'),
  ('Michael Rucker', 3, time '08:00', time '17:00'),
  ('Michael Rucker', 4, time '08:00', time '17:00'),
  ('Michael Rucker', 5, time '08:00', time '17:00'),
  ('Michael Rucker', 6, null, null),
  ('Miles Massengill', 0, null, null),
  ('Miles Massengill', 1, time '09:00', time '17:00'),
  ('Miles Massengill', 2, time '09:00', time '17:00'),
  ('Miles Massengill', 3, time '09:00', time '17:00'),
  ('Miles Massengill', 4, time '09:00', time '17:00'),
  ('Miles Massengill', 5, time '09:00', time '17:00'),
  ('Miles Massengill', 6, null, null),
  ('Robert Elbertson', 0, null, null),
  ('Robert Elbertson', 1, time '08:00', time '17:00'),
  ('Robert Elbertson', 2, time '08:00', time '17:00'),
  ('Robert Elbertson', 3, time '08:00', time '17:00'),
  ('Robert Elbertson', 4, time '08:00', time '17:00'),
  ('Robert Elbertson', 5, time '08:00', time '17:00'),
  ('Robert Elbertson', 6, null, null),
  ('Robert King', 0, null, null),
  ('Robert King', 1, time '08:00', time '16:00'),
  ('Robert King', 2, time '08:00', time '16:00'),
  ('Robert King', 3, time '08:00', time '16:00'),
  ('Robert King', 4, time '08:00', time '16:00'),
  ('Robert King', 5, time '08:00', time '16:00'),
  ('Robert King', 6, null, null),
  ('Shiron Cook', 0, null, null),
  ('Shiron Cook', 1, time '08:00', time '16:30'),
  ('Shiron Cook', 2, time '08:00', time '16:30'),
  ('Shiron Cook', 3, time '08:00', time '16:30'),
  ('Shiron Cook', 4, time '08:00', time '16:30'),
  ('Shiron Cook', 5, time '08:00', time '16:30'),
  ('Shiron Cook', 6, null, null),
  ('Zach Fonticoba', 0, null, null),
  ('Zach Fonticoba', 1, time '08:00', time '18:30'),
  ('Zach Fonticoba', 2, time '08:00', time '18:30'),
  ('Zach Fonticoba', 3, time '08:00', time '18:30'),
  ('Zach Fonticoba', 4, time '08:00', time '18:30'),
  ('Zach Fonticoba', 5, time '08:00', time '18:30'),
  ('Zach Fonticoba', 6, time '08:00', time '17:00');

create temp table hours_changed (name text, weekday int, hours text) on commit drop;
create or replace function pg_temp.hrs(a time, b time) returns text language sql as $$
  select case when a is null then 'off' else to_char(a, 'FMHH12:MI AM') || ' – ' || to_char(b, 'FMHH12:MI AM') end
$$;

-- Working days
with saved as (
  insert into schedules (employee_id, weekday, start_time, end_time)
  select e.id, h.weekday, h.start_time, h.end_time
  from set_hours h join employees e on e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(h.name)
  where h.start_time is not null
  on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time
  returning employee_id, weekday, start_time, end_time
)
insert into hours_changed select e.first_name || ' ' || e.last_name, s.weekday, pg_temp.hrs(s.start_time, s.end_time)
from saved s join employees e on e.id = s.employee_id;

-- Days off
delete from schedules s using set_hours h, employees e
where h.start_time is null and e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(h.name)
  and s.employee_id = e.id and s.weekday = h.weekday;
insert into hours_changed
select e.first_name || ' ' || e.last_name, h.weekday, 'off'
from set_hours h join employees e on e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(h.name)
where h.start_time is null;

insert into hours_changed (name, hours)
select distinct h.name, 'no match: check the name in People' from set_hours h
where not exists (select 1 from employees e where e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(h.name));

select name, string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[weekday + 1], ', ' order by weekday) as days, hours
from hours_changed group by name, hours order by name, min(coalesce(weekday, 9));

commit;
