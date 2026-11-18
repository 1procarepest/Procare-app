-- 2026-11-18. Office staff time off copied from Sling (shifts-export.csv, Oct 26 – Dec 3, 2026).
-- Safe to run more than once: a row is skipped when that person already has time off in the app overlapping
-- those dates (anything not denied or cancelled). Approved in Sling = approved here; "Pending" stays waiting.
-- Paid vacation only where the note asks for PTO. The last result lists what happened to each row.
begin;

create temp table sling_import (name text, start_date date, end_date date, start_time time, end_time time,
  use_pto boolean, status public.request_status, note text, result text) on commit drop;

insert into sling_import (name, start_date, end_date, start_time, end_time, use_pto, status, note) values
  ('Rachel Tewksbury', date '2026-10-26', date '2026-10-26', '08:00'::time, '11:00'::time, false, 'approved', 'Pre-op consult'),
  ('Rachel Tewksbury', date '2026-10-28', date '2026-10-31', null::time, null::time, false, 'approved', 'Surgery and recovery'),
  ('Rachel Tewksbury', date '2026-11-02', date '2026-11-02', null::time, null::time, false, 'pending', null),
  ('Rachel Tewksbury', date '2026-11-03', date '2026-11-03', null::time, null::time, false, 'approved', null),
  ('Jessica Bowles', date '2026-11-05', date '2026-11-05', null::time, null::time, false, 'approved', 'Traveling this day From California back home. No PTO'),
  ('Rachel Tewksbury', date '2026-11-05', date '2026-11-05', '08:45'::time, '12:00'::time, false, 'approved', null),
  ('Kaitryn Acklen', date '2026-11-06', date '2026-11-06', '13:00'::time, '17:00'::time, false, 'approved', null),
  ('Rachel Tewksbury', date '2026-11-12', date '2026-11-12', '13:00'::time, '17:00'::time, false, 'pending', 'Urgent ultrasound Post-op'),
  ('Ally Boyd', date '2026-11-13', date '2026-11-13', null::time, null::time, false, 'approved', 'ally is in arizona for photography job'),
  ('Ryan Boyd', date '2026-11-13', date '2026-11-13', null::time, null::time, false, 'approved', 'working but touch and go'),
  ('Ally Boyd', date '2026-11-16', date '2026-11-16', null::time, null::time, false, 'approved', 'ally is in arizona for photography job'),
  ('Ryan Boyd', date '2026-11-16', date '2026-11-16', null::time, null::time, false, 'approved', 'ryan but touch and go'),
  ('Ally Boyd', date '2026-11-23', date '2026-11-25', null::time, null::time, false, 'approved', 'thanksgiving - parents here'),
  ('Kaitryn Acklen', date '2026-11-23', date '2026-11-23', '14:30'::time, '17:00'::time, false, 'pending', 'Pre move in duties for new home'),
  ('Ryan Boyd', date '2026-11-23', date '2026-11-25', null::time, null::time, false, 'approved', 'thanksgiving'),
  ('Jessica Bowles', date '2026-11-25', date '2026-11-25', null::time, null::time, true, 'approved', 'Off for Thanksgiving yes PTO please'),
  ('Kali Atkinson', date '2026-11-25', date '2026-11-25', null::time, null::time, true, 'approved', 'Use PTO- Family Thanksgiving Dinner- need to prepare and kids are out of school'),
  ('Naomi Zoker', date '2026-12-03', date '2026-12-03', null::time, null::time, false, 'approved', 'Family Birthday celebration');

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
