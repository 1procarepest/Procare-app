-- Helper and trigger functions in Supabase (schema: public).
--
-- Reference copy exported 2026-11-13, including that day's time-off change.
-- The app doesn't run this file. To change a function, paste its
-- `create or replace` block into Supabase → SQL Editor, then update it here.
--
-- Contents
--   Who am I:        my_id, my_rank, my_department, level_rank
--   Permissions:     can_manage, can_edit_schedule, can_see_private,
--                    is_hr_approver, can_approve_time_off
--   Lookups:         employee_contacts
--   Trigger guards:  guard_employee, guard_time_off, guard_issue
--   Other triggers:  default_schedule, log_change, link_auth_user
--   Supabase:        rls_auto_enable

-- ======================================================================
-- Who am I
-- ======================================================================

-- The signed-in person's employees.id (null if not linked or inactive).
CREATE OR REPLACE FUNCTION public.my_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.employees where auth_user_id = auth.uid() and active
$function$;

-- The signed-in person's level as a number (0 if not linked or inactive).
CREATE OR REPLACE FUNCTION public.my_rank()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select public.level_rank(level) from public.employees
                   where auth_user_id = auth.uid() and active), 0)
$function$;

CREATE OR REPLACE FUNCTION public.my_department()
 RETURNS department
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select department from public.employees where auth_user_id = auth.uid() and active
$function$;

-- team_member 1, lead 2, manager 3, c_suite 4, president 5
CREATE OR REPLACE FUNCTION public.level_rank(l level)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case l when 'team_member' then 1 when 'lead' then 2 when 'manager' then 3
                when 'c_suite' then 4 when 'president' then 5 end
$function$;

-- ======================================================================
-- Permissions
-- ======================================================================

-- True when the signed-in person manages `target` (never themselves):
--   President: everyone. C-Suite: everyone but the President.
--   Manager: team members and leads in their department, every office.
--   Lead: team members in their department and office.
CREATE OR REPLACE FUNCTION public.can_manage(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      )
  )
$function$;

-- Who can change a schedule. Sales: the person themselves, a sales manager or the
-- President. Everyone else: whoever manages them.
CREATE OR REPLACE FUNCTION public.can_edit_schedule(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.employees m
    join public.employees t on t.id = target
    where m.auth_user_id = auth.uid() and m.active
      and (
           (t.department = 'sales'
            and (m.id = t.id or m.level = 'president'
                 or (m.department = 'sales' and m.level = 'manager')))
        or (t.department <> 'sales' and public.can_manage(t.id))
      )
  )
$function$;

-- Who can read and edit home addresses (employee_private): C-Suite and the President,
-- office (administrative) managers, and office leads for people in their own office.
CREATE OR REPLACE FUNCTION public.can_see_private(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.employees m
    join public.employees t on t.id = target
    where m.auth_user_id = auth.uid() and m.active
      and (
           public.level_rank(m.level) >= 4
        or (m.department = 'administrative' and m.level = 'manager')
        or (m.department = 'administrative' and m.level = 'lead' and m.office = t.office)
      )
  )
$function$;

-- True for the HR approver (Ally Boyd) and the President. No longer used by the
-- time-off rules since 2026-11-13 (see can_approve_time_off); kept for reference.
CREATE OR REPLACE FUNCTION public.is_hr_approver()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select hr_approver or level = 'president' from public.employees
                   where auth_user_id = auth.uid() and active), false)
$function$;

-- True when the signed-in person may approve or deny time off for `target`.
--   Sales: any active sales manager, or the President.
--   Everyone else: the HR approver, or the President.
--   Nobody but the President approves their own. (Added 2026-11-13.)
CREATE OR REPLACE FUNCTION public.can_approve_time_off(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- ======================================================================
-- Lookups
-- ======================================================================

-- Email and phone by employee. Signed-in people can't read those two columns from
-- employees directly (see policies/employees.sql); they come from here instead.
-- You always get your own; leads and up get everyone they can see. (Added 2026-11-13.)
create or replace function public.employee_contacts(target uuid default null)
returns table (id uuid, email text, phone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.email, e.phone
  from public.employees e
  where (target is null or e.id = target)
    and (
         e.id = public.my_id()
      or (public.my_rank() >= 2 and (e.active or public.can_manage(e.id)))
    )
$$;

revoke execute on function public.employee_contacts(uuid) from public, anon;
grant execute on function public.employee_contacts(uuid) to authenticated;

-- ======================================================================
-- Trigger guards
-- ======================================================================

-- employees, before insert or update. Sets department from FieldRoutes, links the
-- login by email, and enforces who can change what.
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

  -- Your own record: phone number and photo only. Nobody can promote themselves.
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

-- time_off_requests, before insert or update. Sales time off (1099 notices) is
-- approved on insert with decided_by = the person; everyone else's starts pending.
-- Approvers (can_approve_time_off) decide; the requester can only cancel a pending one.
-- (2026-11-13: uses can_approve_time_off; sales notices confirmed automatically
-- and never PTO.)
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

-- schedule_issue_reports, before update. Records who resolved an issue and when;
-- clears both if it's reopened. (Added 2026-11-13.)
create or replace function public.guard_issue()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_by := coalesce(public.my_id(), new.resolved_by);
    new.resolved_at := now();
  elsif new.status = 'open' then
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  return new;
end
$$;

-- ======================================================================
-- Other triggers
-- ======================================================================

-- employees, after insert: new people get Monday–Friday, 9 AM – 6 PM.
CREATE OR REPLACE FUNCTION public.default_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.schedules (employee_id, weekday, start_time, end_time)
  select new.id, d, '09:00', '18:00' from generate_series(1, 5) d
  on conflict do nothing;
  return null;
end $function$;

-- After insert, update or delete on every table: writes a row to activity_log.
CREATE OR REPLACE FUNCTION public.log_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec jsonb;
begin
  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
  insert into public.activity_log (actor_id, action, table_name, record_id, before, after)
  values (public.my_id(), lower(tg_op), tg_table_name,
          coalesce(rec ->> 'id', rec ->> 'employee_id', rec ->> 'key'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $function$;

-- When a login is created in Supabase Auth, links it to the employee with that email.
-- Runs from a trigger on auth.users, which this export (public only) doesn't list.
CREATE OR REPLACE FUNCTION public.link_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.employees set auth_user_id = new.id
  where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end $function$;

-- ======================================================================
-- Supabase
-- ======================================================================

-- Supabase's own event trigger: switches row level security on for every new table
-- in public, so a new table is locked until it has rules.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Route plan data for the /ops/route-plan page (change 2026-11-14-28). See that file for the body.
-- route_plan_data(p_from date, p_to date) returns json: techs, schedules, approved time off, usual, days, builds, changes since built, FieldRoutes template names.

-- Rep work areas for /reps?tab=areas (change 2026-11-14-29). See that file for the bodies.
-- can_see_rep_areas() is true for everyone in sales and anyone lead and up (change 31).
-- rep_work_areas(p_from date, p_to date) returns json: areas (rep + city with 5+ pins), techs in or within 6 miles of each area (period and next 7 days), cities_loaded.
-- Also adds fr_customers.city and fr_customers.zip (no street address), filled by Procare Sync.
-- Change 2026-11-14-30: fr_spots (route spots from today to 7 days out, no customer details; RLS on, no policies)
-- and rep_work_areas() also returns days (per area and day, up to 3 routes: open spots first, then closest job) and spots_loaded.

-- Who can see every rep's pay and edit pay plans: sales managers, C-Suite and the President (change 2026-11-15-32).
-- comp_sales(year, rep) is in changes/2026-11-15-32-comp-plans.sql.
create or replace function public.can_manage_pay()
returns boolean language sql stable security definer set search_path = public as $$
  select my_rank() >= 4 or (my_department() = 'sales' and my_rank() >= 3)
$$;

-- Team schedule (change 2026-11-15-38): sales see the sales team; managers and up in technician/office
-- see those departments; C-Suite and the President see everyone. team_schedule(from, to) is in that change file.
-- Which departments the signed-in person may see on the team schedule
create or replace function public.team_schedule_depts()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when my_rank() >= 4 then array['sales', 'technician', 'administrative']
    when my_department() = 'sales' then array['sales']
    when my_rank() >= 3 then array['technician', 'administrative']
    else array[]::text[]
  end
$$;
revoke all on function public.team_schedule_depts() from public, anon;
grant execute on function public.team_schedule_depts() to authenticated;


-- Competitions (change 2026-11-15-39). competition_board(id) is in that change file: members, and
-- points events (sale / autopay / review) per member per day from the start date through today or the end date.
-- May the signed-in person run a competition for these departments?
create or replace function public.can_run_competition(depts text[])
returns boolean language sql stable security definer set search_path = public as $$
  select my_rank() >= 4
      or (my_rank() = 3 and cardinality(depts) = 1 and depts[1] = my_department()::text)
$$;
revoke all on function public.can_run_competition(text[]) from public, anon;
grant execute on function public.can_run_competition(text[]) to authenticated;

-- May the signed-in person change this competition (and its members)?
create or replace function public.can_edit_competition(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c
    where c.id = p_id and can_run_competition(c.departments) and (my_rank() >= 4 or c.created_by = my_id())
  )
$$;
revoke all on function public.can_edit_competition(uuid) from public, anon;
grant execute on function public.can_edit_competition(uuid) to authenticated;
