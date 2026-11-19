-- 2026-11-18. South follow-up (John): "T Carter" is Latigra Carter, "Idrissa Diop" goes by Eddie, and Robert King moved
-- from West to South (South's Sling is the current one). Matches by the app name, or else by last name among active
-- South-office employees when exactly one fits. Also adds Robert King's Nov 26 PTO day from South's Sling (West's
-- import only had Nov 27). Safe to run more than once.
begin;

create temp table fix_people on commit drop as
select n.sling, coalesce(
  (select e.id from employees e where e.active and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = any (n.names) limit 1),
  (select min(e.id::text)::uuid from employees e
   where e.active and e.office = 'south' and lower(trim(e.last_name)) = n.last having count(*) = 1)) as id
from (values
  ('Latigra Carter', array['latigra carter', 't carter'], 'carter'),
  ('Eddie Diop', array['eddie diop', 'idrissa diop', 'idrissa eddie diop'], 'diop'),
  ('Robert King', array['robert king', 'rob king'], 'king')
) n(sling, names, last);

create temp table fix_result (name text, what text, detail text, result text) on commit drop;

-- Hours: Latigra Mon–Fri 9 – 6; Eddie Tue–Sat 9:30 – 6:30
create temp table fix_hours (sling text, weekday int, start_time time, end_time time) on commit drop;
insert into fix_hours values
  ('Latigra Carter', 0, null, null), ('Latigra Carter', 6, null, null),
  ('Latigra Carter', 1, '09:00', '18:00'), ('Latigra Carter', 2, '09:00', '18:00'), ('Latigra Carter', 3, '09:00', '18:00'),
  ('Latigra Carter', 4, '09:00', '18:00'), ('Latigra Carter', 5, '09:00', '18:00'),
  ('Eddie Diop', 0, null, null), ('Eddie Diop', 1, null, null),
  ('Eddie Diop', 2, '09:30', '18:30'), ('Eddie Diop', 3, '09:30', '18:30'), ('Eddie Diop', 4, '09:30', '18:30'),
  ('Eddie Diop', 5, '09:30', '18:30'), ('Eddie Diop', 6, '09:30', '18:30');
insert into schedules (employee_id, weekday, start_time, end_time)
select p.id, h.weekday, h.start_time, h.end_time from fix_hours h join fix_people p using (sling)
where p.id is not null and h.start_time is not null
on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time;
delete from schedules s using fix_hours h, fix_people p
where p.sling = h.sling and p.id = s.employee_id and s.weekday = h.weekday and h.start_time is null;
insert into fix_result
select h.sling || ' → ' || coalesce(e.first_name || ' ' || e.last_name, '?'), 'hours', '',
       case when p.id is null then 'no match: check the name in People' else 'set' end
from (select distinct sling from fix_hours) h join fix_people p using (sling) left join employees e on e.id = p.id;

-- Time off
create temp table fix_off (sling text, start_date date, end_date date, use_pto boolean, status public.request_status, note text) on commit drop;
insert into fix_off values
  ('Latigra Carter', '2026-12-02', '2026-12-02', false, 'pending', 'Son has a doctor''s appointment at 8:30am'),
  ('Latigra Carter', '2026-12-21', '2026-12-24', false, 'pending', 'DO NOT USE PTO SAVING FOR FUTURE DAYS.'),
  ('Latigra Carter', '2026-12-28', '2027-01-03', false, 'pending', 'DO NOT USE PTO SAVING FOR VACATION'),
  ('Robert King', '2026-11-26', '2026-11-26', true, 'approved', 'PTO');
insert into fix_result
select o.sling, 'time off', o.start_date || ' to ' || o.end_date,
       case when p.id is null then 'no match: check the name in People'
            when exists (select 1 from time_off_requests t where t.employee_id = p.id and t.status not in ('denied', 'cancelled')
                         and t.start_date <= o.end_date and t.end_date >= o.start_date) then 'skipped: already in the app'
            else 'added' end
from fix_off o join fix_people p using (sling);
insert into time_off_requests (employee_id, start_date, end_date, use_pto, note, status, decided_at)
select p.id, o.start_date, o.end_date, o.use_pto, o.note, o.status, case when o.status = 'approved' then now() end
from fix_off o join fix_people p using (sling)
join fix_result r on r.name = o.sling and r.what = 'time off' and r.detail = o.start_date || ' to ' || o.end_date and r.result = 'added';

select * from fix_result order by name, what, detail;

commit;
