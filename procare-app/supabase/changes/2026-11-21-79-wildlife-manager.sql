-- 79 (2026-11-21). Jessica runs the wildlife team (John, 2026-11-20): "she'll control their pay and schedule."
--  * employees.manages_wildlife: a switch on the person's Settings page (C-Suite). Jessica Bowles is switched on here.
--    Wildlife team only: it gives no say over anyone else.
--  * can_manage: a wildlife manager manages the wildlife department (Bryan and Sam are level 'manager', so the usual
--    manager rule doesn't reach them). The person page keeps their profile (level, office, active) for C-Suite; she
--    gets their schedule, time off and schedule issues.
--  * can_approve_time_off: she approves or denies the wildlife team's time off (the HR approver and the President still can).
--  * Their time-off requests, schedule issues and availability forms are emailed to her (app/api/notify).
--  * Wildlife pay: she manages it too (pay plans, splits, office assist), like the HR approver.
-- Safe to run twice.

begin;

alter table public.employees add column if not exists manages_wildlife boolean not null default false;

-- Everyone else's rules are unchanged; the last line is new
create or replace function public.can_manage(target uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1
    from public.employees m
    join public.employees t on t.id = target
    where m.auth_user_id = auth.uid() and m.active and m.id <> t.id
      and (
           m.level = 'president'
        or (m.level = 'c_suite' and t.level <> 'president')
        or (m.level = 'manager' and m.department = t.department and public.level_rank(t.level) < 3)
        or (m.level = 'lead' and m.department = t.department and m.office = t.office
            and t.level = 'team_member')
        or (m.manages_wildlife and t.department::text = 'wildlife' and public.level_rank(t.level) < 4)
      )
  )
$function$;

create or replace function public.can_approve_time_off(target uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
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
        or (m.id <> t.id and t.department::text = 'wildlife' and m.manages_wildlife)
      )
  )
$function$;

create or replace function public.can_manage_wildlife_pay()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_rank() >= 4, false) or is_hr_approver()
      or exists (select 1 from employees e where e.id = my_id() and e.active and e.manages_wildlife)
$$;

-- The switch (C-Suite and the President)
create or replace function public.set_manages_wildlife(p_employee uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite and the President can change this.'; end if;
  update employees set manages_wildlife = coalesce(p_on, false), updated_at = now() where id = p_employee;
end $$;
revoke all on function public.set_manages_wildlife(uuid, boolean) from public, anon;
grant execute on function public.set_manages_wildlife(uuid, boolean) to authenticated;

update public.employees set manages_wildlife = true, updated_at = now()
where active and lower(trim(first_name)) in ('jessica', 'jess') and lower(trim(last_name)) = 'bowles' and not manages_wildlife;

commit;

-- Check
select 'wildlife manager' as what, coalesce(string_agg(first_name || ' ' || last_name, ', '), '(nobody yet)') as detail
from public.employees where active and manages_wildlife
union all
select 'wildlife team', string_agg(first_name || ' ' || last_name || ' (' || level || ')', ', ')
from public.employees where active and department::text = 'wildlife';
