-- 2026-11-13. Sales are 1099: they notify of time off instead of asking for it.
--
-- guard_time_off(): when someone in the sales department adds time off, it's
-- approved on the spot (decided_by = themselves, decided_at = now), so it shows on
-- their schedule right away. Everyone else's requests still start pending.
-- Nothing else changes.

begin;

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
      -- Sales notice: confirmed right away.
      new.status := 'approved';
      new.decided_by := actor.id;
      new.decided_at := now();
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

-- Sales requests already waiting for a decision become confirmed notices too.
update public.time_off_requests r
set status = 'approved', decided_by = r.employee_id, decided_at = now()
where r.status = 'pending'
  and exists (select 1 from public.employees t where t.id = r.employee_id and t.department = 'sales');

commit;
