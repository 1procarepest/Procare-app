-- 2026-11-18. Atlanta South weekly hours and time off from Sling (shift exports, Oct 26 – Jan 3).
-- Names: an exact first + last name match, or else (Sling's "T Carter", "Rob King") a South-office employee with that
-- last name and first initial, when exactly one fits. "Rob King" never matches West's Robert King (different person).
-- Hours: sets all seven days; a day not worked is set to off. Time off: skipped if the app already has time off on
-- those dates. "Do not use PTO" notes are not paid vacation. Safe to run more than once.
begin;

create temp table south_hours (name text, weekday int, start_time time, end_time time) on commit drop;
insert into south_hours values
  ('Idrissa Diop', 0, null, null), ('Idrissa Diop', 1, null, null),
  ('Idrissa Diop', 2, '09:30', '18:30'), ('Idrissa Diop', 3, '09:30', '18:30'), ('Idrissa Diop', 4, '09:30', '18:30'),
  ('Idrissa Diop', 5, '09:30', '18:30'), ('Idrissa Diop', 6, '09:30', '18:30'),
  ('Josh Baker', 0, null, null), ('Josh Baker', 1, null, null),
  ('Josh Baker', 2, '09:30', '18:30'), ('Josh Baker', 3, '09:30', '18:30'), ('Josh Baker', 4, '09:30', '18:30'),
  ('Josh Baker', 5, '09:30', '18:30'), ('Josh Baker', 6, '09:30', '18:30'),
  ('Oscar Ayala', 0, null, null), ('Oscar Ayala', 1, null, null),
  ('Oscar Ayala', 2, '10:00', '18:00'), ('Oscar Ayala', 3, '10:00', '18:00'), ('Oscar Ayala', 4, '10:00', '18:00'),
  ('Oscar Ayala', 5, '10:00', '18:00'), ('Oscar Ayala', 6, '10:00', '18:00'),
  ('Rob King', 0, null, null), ('Rob King', 6, null, null),
  ('Rob King', 1, '09:00', '17:00'), ('Rob King', 2, '09:00', '17:00'), ('Rob King', 3, '09:00', '17:00'),
  ('Rob King', 4, '09:00', '17:00'), ('Rob King', 5, '09:00', '17:00'),
  ('T Carter', 0, null, null), ('T Carter', 6, null, null),
  ('T Carter', 1, '09:00', '18:00'), ('T Carter', 2, '09:00', '18:00'), ('T Carter', 3, '09:00', '18:00'),
  ('T Carter', 4, '09:00', '18:00'), ('T Carter', 5, '09:00', '18:00');

create temp table south_off (name text, start_date date, end_date date, use_pto boolean, status public.request_status, note text) on commit drop;
insert into south_off values
  ('Oscar Ayala', '2026-10-28', '2026-10-28', false, 'approved', 'Doctor appointment, will make up the day on Monday. Do not use PTO'),
  ('Oscar Ayala', '2026-11-24', '2026-11-24', false, 'approved', 'Doctor appointment, will make up the day on Monday. Do not use PTO'),
  ('Oscar Ayala', '2026-12-08', '2026-12-08', false, 'approved', 'Doctor appointment, will make up the day on Monday. Do not use PTO'),
  ('Josh Baker', '2026-11-25', '2026-11-30', false, 'approved', 'Out of town for Thanksgiving'),
  ('Rob King', '2026-11-26', '2026-11-27', true, 'approved', 'PTO'),
  ('Rob King', '2026-11-30', '2026-11-30', true, 'approved', 'PTO'),
  ('T Carter', '2026-12-02', '2026-12-02', false, 'pending', 'Son has a doctor''s appointment at 8:30am'),
  ('T Carter', '2026-12-21', '2026-12-24', false, 'pending', 'DO NOT USE PTO SAVING FOR FUTURE DAYS.'),
  ('T Carter', '2026-12-28', '2027-01-03', false, 'pending', 'DO NOT USE PTO SAVING FOR VACATION');

-- Who each Sling name is in the app
create temp table south_people on commit drop as
select n.name, coalesce(
  (select e.id from employees e where e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(n.name) limit 1),
  (select min(e.id::text)::uuid from employees e
   where e.active and e.office = 'south' and lower(trim(e.last_name)) = lower(split_part(n.name, ' ', 2))
     and lower(left(trim(e.first_name), 1)) = lower(left(n.name, 1))
   having count(*) = 1)) as id
from (select distinct name from south_hours union select distinct name from south_off) n;

create temp table south_result (name text, what text, detail text, result text) on commit drop;

-- Hours
insert into schedules (employee_id, weekday, start_time, end_time)
select p.id, h.weekday, h.start_time, h.end_time from south_hours h join south_people p using (name)
where p.id is not null and h.start_time is not null
on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time;
delete from schedules s using south_hours h, south_people p
where p.name = h.name and p.id = s.employee_id and s.weekday = h.weekday and h.start_time is null;
insert into south_result
select p.name || ' → ' || e.first_name || ' ' || e.last_name, 'hours',
       string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[h.weekday + 1] || ' ' ||
                  to_char(h.start_time, 'FMHH12:MI AM') || '–' || to_char(h.end_time, 'FMHH12:MI AM'), ', ' order by h.weekday),
       'set'
from south_hours h join south_people p using (name) join employees e on e.id = p.id
where h.start_time is not null group by p.name, e.first_name, e.last_name;

-- Time off
insert into south_result
select o.name, 'time off', o.start_date || ' to ' || o.end_date,
       case when p.id is null then 'no match: check the name in People'
            when exists (select 1 from time_off_requests t where t.employee_id = p.id and t.status not in ('denied', 'cancelled')
                         and t.start_date <= o.end_date and t.end_date >= o.start_date) then 'skipped: already in the app'
            else 'added' end
from south_off o join south_people p using (name);
insert into time_off_requests (employee_id, start_date, end_date, use_pto, note, status, decided_at)
select p.id, o.start_date, o.end_date, o.use_pto, o.note, o.status, case when o.status = 'approved' then now() end
from south_off o join south_people p using (name)
join south_result r on r.name = o.name and r.what = 'time off' and r.detail = o.start_date || ' to ' || o.end_date and r.result = 'added';

insert into south_result select name, 'hours', '', 'no match: check the name in People' from south_people where id is null;

select * from south_result order by result <> 'no match: check the name in People', name, what, detail;

commit;
