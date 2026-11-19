-- 2026-11-18 (change 56). C-Suite can change their own office, level and final approval on time off, the same as
-- they can for others (the President already could). Nobody but the President can make or edit a President.
-- guard_employee() is unchanged otherwise.
begin;

CREATE OR REPLACE FUNCTION public.guard_employee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.employees;
begin
  new.department := case new.fr_employee_type
                      when 2 then 'sales'::public.department
                      when 1 then 'technician'::public.department
                      else 'administrative'::public.department end;
  new.email := lower(trim(new.email));
  new.updated_at := now();
  if new.auth_user_id is null then
    select u.id into new.auth_user_id from auth.users u where lower(u.email) = new.email;
  end if;

  -- Imports, setup and the SQL editor run without a signed-in user.
  if auth.uid() is null then return new; end if;

  select * into actor from public.employees e where e.auth_user_id = auth.uid() and e.active;
  if not found then raise exception 'Only active employees can make changes'; end if;
  if actor.level = 'president' then return new; end if;

  if new.level = 'president' or (tg_op = 'UPDATE' and old.level = 'president') then
    raise exception 'Only the President can create or edit a President account';
  end if;

  -- C-Suite, own record (change 56): also office, level (never President, checked above) and final approval.
  if tg_op = 'UPDATE' and old.id = actor.id and actor.level = 'c_suite' then
    if (new.email, new.first_name, new.last_name, new.fr_employee_type, new.fr_ids,
        new.samsara_driver_id, new.active, new.auth_user_id)
       is distinct from
       (old.email, old.first_name, old.last_name, old.fr_employee_type, old.fr_ids,
        old.samsara_driver_id, old.active, old.auth_user_id) then
      raise exception 'You can change your own office, level and final approval, but not those details';
    end if;
    return new;
  end if;

  -- Your own record (everyone else): phone number and photo only. Nobody can promote themselves.
  if tg_op = 'UPDATE' and old.id = actor.id then
    if (new.email, new.first_name, new.last_name, new.office, new.fr_employee_type, new.fr_ids,
        new.samsara_driver_id, new.level, new.hr_approver, new.active, new.auth_user_id)
       is distinct from
       (old.email, old.first_name, old.last_name, old.office, old.fr_employee_type, old.fr_ids,
        old.samsara_driver_id, old.level, old.hr_approver, old.active, old.auth_user_id) then
      raise exception 'You can only change your own phone number and photo';
    end if;
    return new;
  end if;

  if public.level_rank(new.level) > public.level_rank(actor.level)
     or (new.level = actor.level and actor.level <> 'c_suite') then
    raise exception 'You can only give out levels below your own';
  end if;
  if actor.level in ('lead', 'manager') and new.department <> actor.department then
    raise exception 'You can only manage people in your own department';
  end if;
  if actor.level = 'lead' and new.office is distinct from actor.office then
    raise exception 'Leads can only manage people in their own office';
  end if;
  if new.hr_approver and public.level_rank(actor.level) < 4
     and (tg_op = 'INSERT' or not old.hr_approver) then
    raise exception 'Only C-Suite can make someone the time-off approver';
  end if;
  if tg_op = 'UPDATE' and old.auth_user_id is not null
     and new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Login links are managed by the system';
  end if;
  return new;
end $function$;

commit;
