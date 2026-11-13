-- 2026-11-13. Paid time off flag and partial days on time-off requests.
-- Run before the app update that uses these columns. Adds columns; changes no data.
--
-- use_pto:              the person wants to use paid time off (not available to sales: 1099).
-- start_time, end_time: part of a day. Both empty = full days. When set, the request
--                       is for one day only and start_time is before end_time.

begin;

alter table public.time_off_requests
  add column if not exists use_pto boolean not null default false,
  add column if not exists start_time time,
  add column if not exists end_time time;

alter table public.time_off_requests
  drop constraint if exists time_off_partial_day;
alter table public.time_off_requests
  add constraint time_off_partial_day check (
       (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null
        and start_time < end_time and start_date = end_date)
  );

-- Same as before, plus: sales notices never use PTO.
create or replace function public.guard_time_off()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor public.employees;
begin
  if auth.uid() is null then return new; end if;
  select * into actor from public.employees e where e.auth_user_id = auth.uid() and e.active;

  if tg_op = 'INSERT' then
    new.decision_note := null;
    if exists (select 1 from public.employees t where t.id = new.employee_id and t.department = 'sales') then
      -- Sales notice (1099): confirmed right away, never paid time off.
      new.status := 'approved';
      new.decided_by := actor.id;
      new.decided_at := now();
      new.use_pto := false;
    else
      new.status := 'pending';
      new.decided_by := null;
      new.decided_at := null;
    end if;
    return new;
  end if;

  if public.can_approve_time_off(old.employee_id) then
    if new.status is distinct from old.status and new.status in ('approved', 'denied') then
      new.decided_by := actor.id;
      new.decided_at := now();
    end if;
    return new;
  end if;

  if old.employee_id = actor.id and old.status = 'pending' and new.status = 'cancelled' then
    new := old;
    new.status := 'cancelled';
    return new;
  end if;

  raise exception 'Only the approver can approve or deny this time off';
end
$$;

commit;
