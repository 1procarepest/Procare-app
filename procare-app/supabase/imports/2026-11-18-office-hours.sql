-- 2026-11-18. Office team hours (John).
--   1. Office team default is 8:30 AM – 5 PM (staff start 30 minutes before the office opens): every office-team
--      weekday set to 9 AM – 6 PM or 9 AM – 5 PM becomes 8:30 – 5. Any other hours (like Kaitryn's 9 – 4 Monday) stay.
--   2. Set exactly (days not listed are left as they are; "off" = not scheduled that day):
--      Ally Boyd        Mon, Tue, Thu, Fri 7:30 – 5; Wed 7 – 4
--      Rachel Tewksbury Mon, Tue, Wed 8:30 – 5; Thu 8:45 – 12:45; Fri 1 – 5; Sat off
--      Katie Bishop     Mon 8:45 – 2; Tue 8:30 – 5; Wed 8:45 – 3:30; Thu 8:30 – 5; Fri, Sat, Sun off
-- Safe to run more than once. The result lists each person and day that changed; "no match" means check the name.
begin;

create temp table set_hours (name text, weekday int, start_time time, end_time time) on commit drop;
insert into set_hours values
  ('Ally Boyd', 1, '07:30', '17:00'), ('Ally Boyd', 2, '07:30', '17:00'), ('Ally Boyd', 3, '07:00', '16:00'),
  ('Ally Boyd', 4, '07:30', '17:00'), ('Ally Boyd', 5, '07:30', '17:00'),
  ('Rachel Tewksbury', 1, '08:30', '17:00'), ('Rachel Tewksbury', 2, '08:30', '17:00'), ('Rachel Tewksbury', 3, '08:30', '17:00'),
  ('Rachel Tewksbury', 4, '08:45', '12:45'), ('Rachel Tewksbury', 5, '13:00', '17:00'), ('Rachel Tewksbury', 6, null, null),
  ('Katie Bishop', 1, '08:45', '14:00'), ('Katie Bishop', 2, '08:30', '17:00'), ('Katie Bishop', 3, '08:45', '15:30'),
  ('Katie Bishop', 4, '08:30', '17:00'), ('Katie Bishop', 5, null, null), ('Katie Bishop', 6, null, null), ('Katie Bishop', 0, null, null);

create temp table hours_changed (name text, weekday int, hours text) on commit drop;
create or replace function pg_temp.hrs(a time, b time) returns text language sql as $$
  select case when a is null then 'off' else
    to_char(a, 'FMHH12:MI AM') || ' – ' || to_char(b, 'FMHH12:MI AM') end
$$;

-- 1. Office default for everyone not set exactly below
with changed as (
  update schedules s set start_time = time '08:30', end_time = time '17:00'
  from employees e
  where e.id = s.employee_id and e.active and e.department = 'administrative'
    and s.start_time = time '09:00' and s.end_time in (time '18:00', time '17:00')
    and lower(e.first_name || ' ' || e.last_name) not in (select distinct lower(name) from set_hours)
  returning e.first_name || ' ' || e.last_name as name, s.weekday
)
insert into hours_changed select name, weekday, pg_temp.hrs(time '08:30', time '17:00') from changed;

-- 2. The people with their own hours
with saved as (
  insert into schedules (employee_id, weekday, start_time, end_time)
  select e.id, h.weekday, h.start_time, h.end_time
  from set_hours h join employees e on e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(h.name)
  on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time
  returning employee_id, weekday, start_time, end_time
)
insert into hours_changed
select e.first_name || ' ' || e.last_name, s.weekday, pg_temp.hrs(s.start_time, s.end_time)
from saved s join employees e on e.id = s.employee_id;

insert into hours_changed (name, hours)
select distinct h.name, 'no match: check the name in People' from set_hours h
where not exists (select 1 from employees e where e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(h.name));

select name, string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[weekday + 1], ', ' order by weekday) as days, hours
from hours_changed group by name, hours order by name, min(weekday);

commit;
