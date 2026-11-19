-- 2026-11-18. Atlanta East weekly hours from Sling (shift exports, Oct 26 – Jan 2). Each person's usual hours per weekday,
-- the recent pattern where it changed (Brian Perkins: Fridays to 4 PM since Nov 20; Shellie Boyd: no Saturdays since
-- mid-November). Moriah Cooper 8:30 – 4 as in Sling. DeMarcus Usher, Drake Bitler and Ta'Sjier Graham left the East
-- schedule in early November and are not changed. Sets all seven days; a day not worked is set to off.
begin;

create temp table set_hours (name text, weekday int, start_time time, end_time time) on commit drop;
insert into set_hours values
  ('Adin Sanford', 0, null, null),
  ('Adin Sanford', 1, time '09:30', time '17:30'),
  ('Adin Sanford', 2, time '09:30', time '17:30'),
  ('Adin Sanford', 3, time '09:30', time '17:30'),
  ('Adin Sanford', 4, time '09:30', time '17:30'),
  ('Adin Sanford', 5, time '09:30', time '17:30'),
  ('Adin Sanford', 6, null, null),
  ('Adiyah Mack', 0, null, null),
  ('Adiyah Mack', 1, time '09:00', time '18:00'),
  ('Adiyah Mack', 2, time '09:00', time '18:00'),
  ('Adiyah Mack', 3, time '09:00', time '18:00'),
  ('Adiyah Mack', 4, time '09:00', time '18:00'),
  ('Adiyah Mack', 5, time '09:00', time '18:00'),
  ('Adiyah Mack', 6, null, null),
  ('Alonzo Gradney', 0, null, null),
  ('Alonzo Gradney', 1, null, null),
  ('Alonzo Gradney', 2, time '09:00', time '18:00'),
  ('Alonzo Gradney', 3, time '09:00', time '18:00'),
  ('Alonzo Gradney', 4, time '09:00', time '18:00'),
  ('Alonzo Gradney', 5, time '09:00', time '18:00'),
  ('Alonzo Gradney', 6, time '09:00', time '18:00'),
  ('Bart Jordan', 0, null, null),
  ('Bart Jordan', 1, null, null),
  ('Bart Jordan', 2, time '09:00', time '18:00'),
  ('Bart Jordan', 3, time '09:00', time '18:00'),
  ('Bart Jordan', 4, time '09:00', time '18:00'),
  ('Bart Jordan', 5, time '09:00', time '18:00'),
  ('Bart Jordan', 6, time '09:00', time '18:00'),
  ('Brandon Price', 0, null, null),
  ('Brandon Price', 1, null, null),
  ('Brandon Price', 2, time '09:00', time '17:00'),
  ('Brandon Price', 3, time '09:00', time '17:00'),
  ('Brandon Price', 4, time '09:00', time '17:00'),
  ('Brandon Price', 5, time '09:00', time '17:00'),
  ('Brandon Price', 6, null, null),
  ('Brian Perkins', 0, null, null),
  ('Brian Perkins', 1, time '09:00', time '18:00'),
  ('Brian Perkins', 2, time '09:00', time '18:00'),
  ('Brian Perkins', 3, time '09:00', time '18:00'),
  ('Brian Perkins', 4, time '09:00', time '18:00'),
  ('Brian Perkins', 5, time '09:00', time '16:00'),
  ('Brian Perkins', 6, null, null),
  ('Gio Rebollar', 0, null, null),
  ('Gio Rebollar', 1, time '09:30', time '18:30'),
  ('Gio Rebollar', 2, time '09:30', time '18:30'),
  ('Gio Rebollar', 3, time '09:30', time '18:30'),
  ('Gio Rebollar', 4, time '09:30', time '18:30'),
  ('Gio Rebollar', 5, time '09:30', time '18:30'),
  ('Gio Rebollar', 6, null, null),
  ('Jarvis Sigler', 0, null, null),
  ('Jarvis Sigler', 1, time '09:00', time '18:00'),
  ('Jarvis Sigler', 2, time '09:00', time '18:00'),
  ('Jarvis Sigler', 3, time '09:00', time '18:00'),
  ('Jarvis Sigler', 4, time '09:00', time '18:00'),
  ('Jarvis Sigler', 5, time '09:00', time '18:00'),
  ('Jarvis Sigler', 6, null, null),
  ('Juwon Williams', 0, null, null),
  ('Juwon Williams', 1, time '09:00', time '18:00'),
  ('Juwon Williams', 2, time '09:00', time '18:00'),
  ('Juwon Williams', 3, time '09:00', time '18:00'),
  ('Juwon Williams', 4, time '09:00', time '18:00'),
  ('Juwon Williams', 5, time '09:00', time '18:00'),
  ('Juwon Williams', 6, null, null),
  ('Keon Powell', 0, null, null),
  ('Keon Powell', 1, time '09:00', time '18:00'),
  ('Keon Powell', 2, time '09:00', time '18:00'),
  ('Keon Powell', 3, time '09:00', time '18:00'),
  ('Keon Powell', 4, time '09:00', time '18:00'),
  ('Keon Powell', 5, time '09:00', time '18:00'),
  ('Keon Powell', 6, time '09:00', time '18:00'),
  ('Lisa Schaal', 0, null, null),
  ('Lisa Schaal', 1, time '09:00', time '17:00'),
  ('Lisa Schaal', 2, time '09:00', time '17:00'),
  ('Lisa Schaal', 3, time '09:00', time '17:00'),
  ('Lisa Schaal', 4, time '09:00', time '17:00'),
  ('Lisa Schaal', 5, time '09:00', time '17:00'),
  ('Lisa Schaal', 6, null, null),
  ('Mandi Erickson', 0, null, null),
  ('Mandi Erickson', 1, time '09:00', time '18:00'),
  ('Mandi Erickson', 2, time '09:00', time '18:00'),
  ('Mandi Erickson', 3, time '09:00', time '18:00'),
  ('Mandi Erickson', 4, time '09:00', time '18:00'),
  ('Mandi Erickson', 5, time '09:00', time '18:00'),
  ('Mandi Erickson', 6, null, null),
  ('Michael Williams', 0, null, null),
  ('Michael Williams', 1, time '09:30', time '18:30'),
  ('Michael Williams', 2, time '09:30', time '18:30'),
  ('Michael Williams', 3, time '09:30', time '18:30'),
  ('Michael Williams', 4, time '09:30', time '18:30'),
  ('Michael Williams', 5, time '09:30', time '18:30'),
  ('Michael Williams', 6, null, null),
  ('Moriah Cooper', 0, null, null),
  ('Moriah Cooper', 1, time '08:30', time '16:00'),
  ('Moriah Cooper', 2, time '08:30', time '16:00'),
  ('Moriah Cooper', 3, time '08:30', time '16:00'),
  ('Moriah Cooper', 4, time '08:30', time '16:00'),
  ('Moriah Cooper', 5, time '08:30', time '16:00'),
  ('Moriah Cooper', 6, null, null),
  ('Shellie Boyd', 0, null, null),
  ('Shellie Boyd', 1, time '09:00', time '18:00'),
  ('Shellie Boyd', 2, time '09:00', time '18:00'),
  ('Shellie Boyd', 3, time '09:00', time '18:00'),
  ('Shellie Boyd', 4, time '09:00', time '18:00'),
  ('Shellie Boyd', 5, time '09:00', time '18:00'),
  ('Shellie Boyd', 6, null, null);

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

-- 2026-11-18. Atlanta East time off from Sling. Days scheduled as a "PTO" shift in Sling count as approved paid vacation.
-- Safe to run more than once: a row is skipped when that person already has time off in the app overlapping
-- those dates (anything not denied or cancelled). Approved in Sling = approved here; "Pending" stays waiting.
-- Paid vacation only where the note asks for PTO. The last result lists what happened to each row.
begin;

create temp table sling_import (name text, start_date date, end_date date, start_time time, end_time time,
  use_pto boolean, status public.request_status, note text, result text) on commit drop;

insert into sling_import (name, start_date, end_date, start_time, end_time, use_pto, status, note) values
  ('Shellie Boyd', date '2026-10-27', date '2026-10-27', null::time, null::time, true, 'approved', 'PTO Dr Appt'),
  ('Jarvis Sigler', date '2026-11-10', date '2026-11-12', null::time, null::time, true, 'approved', 'Anniversary use PTO if I have it'),
  ('Mandi Erickson', date '2026-11-13', date '2026-11-13', null::time, null::time, false, 'approved', 'Doctor appointment'),
  ('Keon Powell', date '2026-11-18', date '2026-11-18', null::time, null::time, true, 'approved', 'PTO (scheduled in Sling)'),
  ('Lisa Schaal', date '2026-11-20', date '2026-11-20', null::time, null::time, true, 'approved', 'PTO (scheduled in Sling)'),
  ('Shellie Boyd', date '2026-11-24', date '2026-11-24', null::time, null::time, true, 'approved', 'Request PTO'),
  ('Adin Sanford', date '2026-11-25', date '2026-11-25', null::time, null::time, true, 'approved', 'Unexpected holiday travel. Please use PTO if possible.'),
  ('Shellie Boyd', date '2026-11-26', date '2026-11-27', null::time, null::time, true, 'approved', 'Request PTO');

update sling_import s set result = 'no match: check the name in People'
where not exists (select 1 from employees e where lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(s.name));

update sling_import s set result = 'skipped: already in the app'
where result is null and exists (
  select 1 from employees e join time_off_requests t on t.employee_id = e.id
  where lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(s.name)
    and t.status not in ('denied', 'cancelled') and t.start_date <= s.end_date and t.end_date >= s.start_date);

insert into time_off_requests (employee_id, start_date, end_date, start_time, end_time, use_pto, note, status, decided_at)
select e.id, s.start_date, s.end_date, s.start_time, s.end_time, s.use_pto, s.note, s.status,
       case when s.status = 'approved' then now() end
from sling_import s
join employees e on lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(s.name)
where s.result is null;

update sling_import set result = 'added' where result is null;


select name, start_date, end_date, start_time, end_time, use_pto, status, note, result from sling_import order by start_date, name;

commit;
