-- 2026-11-18. Atlanta West time off copied from Sling (three exports, Nov 3 – Dec 31, 2026).
-- "All day" = a full day off. Weekly schedules are not changed.
-- Safe to run more than once: a row is skipped when that person already has time off in the app overlapping
-- those dates (anything not denied or cancelled). Approved in Sling = approved here; "Pending" stays waiting.
-- Paid vacation only where the note asks for PTO. The last result lists what happened to each row.
begin;

create temp table sling_import (name text, start_date date, end_date date, start_time time, end_time time,
  use_pto boolean, status public.request_status, note text, result text) on commit drop;

insert into sling_import (name, start_date, end_date, start_time, end_time, use_pto, status, note) values
  ('Branden Logan', date '2026-11-03', date '2026-11-03', null::time, null::time, true, 'pending', 'Funeral for my grandmother please use pto if I have any'),
  ('Adam Townsend', date '2026-11-07', date '2026-11-07', null::time, null::time, false, 'approved', 'Family event'),
  ('KC Todd', date '2026-11-09', date '2026-11-13', null::time, null::time, false, 'approved', 'Vacation/hunting'),
  ('Mark Oldfield', date '2026-11-09', date '2026-11-09', null::time, null::time, false, 'approved', 'Need to get with my insurance company and drop off personal vehicle for repairs'),
  ('Adam Townsend', date '2026-11-14', date '2026-11-14', null::time, null::time, false, 'approved', 'Family event'),
  ('Miles Massengill', date '2026-11-20', date '2026-11-20', null::time, null::time, true, 'approved', 'Please use PTO for this'),
  ('Adam Townsend', date '2026-11-21', date '2026-11-21', null::time, null::time, false, 'approved', 'Family event'),
  ('Jacari Harris', date '2026-11-24', date '2026-11-30', null::time, null::time, false, 'approved', 'Traveling out of town'),
  ('Robert King', date '2026-11-27', date '2026-11-27', null::time, null::time, true, 'approved', 'PTO can I please get information on my Days off after this time.'),
  ('Zach Fonticoba', date '2026-11-27', date '2026-11-27', null::time, null::time, true, 'approved', 'Off with pto if able for Black Friday'),
  ('Zach Fonticoba', date '2026-11-28', date '2026-11-28', null::time, null::time, true, 'approved', 'Off for holiday use pto if able'),
  ('Robert King', date '2026-11-30', date '2026-11-30', null::time, null::time, true, 'approved', 'PTO'),
  ('Adam Townsend', date '2026-12-15', date '2026-12-20', null::time, null::time, false, 'approved', 'Have to travel back to Arizona for familyv'),
  ('KC Todd', date '2026-12-21', date '2026-12-23', null::time, null::time, false, 'approved', 'Vacation'),
  ('Zach Fonticoba', date '2026-12-26', date '2026-12-26', null::time, null::time, true, 'approved', 'Off for Kwanzaa… not really. just to be off the holiday weekend and with pto if able'),
  ('KC Todd', date '2026-12-28', date '2026-12-31', null::time, null::time, false, 'approved', null);

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
