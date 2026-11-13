-- Time-off approval rules for public.time_off_requests.
--
-- This file is a record of what is set in Supabase. The app doesn't run it;
-- changes are made by pasting into Supabase → SQL Editor. Keep this file in step
-- with the database whenever a rule changes.
--
-- Who approves time off
--   Sales department: any active sales manager, or the President.
--   Everyone else:    the HR approver (Ally Boyd), or the President.
--   Nobody approves their own request, except the President.
--
-- History
--   2026-11-13  Sales can request time off. Sales requests go to the sales
--               manager or the President instead of HR. Adds
--               can_approve_time_off(); insert, read and update rules and
--               guard_time_off() use it.
--
-- Unchanged and not repeated here: the log_time_off trigger (log_change()),
-- my_id(), my_department(), can_manage(), is_hr_approver().

begin;

-- True when the signed-in person may approve or deny time off for `target`.
create or replace function public.can_approve_time_off(target uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.employees m
    join public.employees t on t.id = target
    where m.auth_user_id = auth.uid() and m.active
      and (
           m.level = 'president'
        or (m.id <> t.id and t.department = 'sales'
            and m.department = 'sales' and m.level = 'manager')
        or (m.id <> t.id and t.department <> 'sales' and m.hr_approver)
      )
  )
$$;

-- Everyone, sales included, can request time off for themselves.
drop policy if exists time_off_insert on public.time_off_requests;
create policy time_off_insert on public.time_off_requests
  for insert
  with check (employee_id = my_id());

-- People see their own requests, their team's, and the ones they approve.
drop policy if exists time_off_read on public.time_off_requests;
create policy time_off_read on public.time_off_requests
  for select
  using ((employee_id = my_id()) or can_manage(employee_id) or can_approve_time_off(employee_id));

-- People can cancel their own pending request; approvers decide.
-- guard_time_off() below enforces which changes each person can make.
drop policy if exists time_off_update on public.time_off_requests;
create policy time_off_update on public.time_off_requests
  for update
  using ((employee_id = my_id()) or can_approve_time_off(employee_id))
  with check (true);

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
    new.status := 'pending';
    new.decided_by := null; new.decided_at := null; new.decision_note := null;
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
