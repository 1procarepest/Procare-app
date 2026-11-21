-- 78 (2026-11-21). Approved drivers: who is on the company auto policy (John, 2026-11-21).
--  * employees.approved_driver: the switch (managers see it). Turning it on or off queues an email to the insurance
--    agent (fleet_settings.insurance_email, change 75): "please add this driver" / "please remove this driver".
--    Deactivating someone who is a driver (in the app or by the FieldRoutes sync) switches it off and queues the
--    removal; the daily sync sends anything still waiting.
--  * driver_licenses: license state and number, birth date and home address. Only C-Suite, the President and the HR
--    approver (Ally), with the authenticator step, can see or change them. The email to the agent carries the name,
--    birth date and license (never the home address).
--  * driver_events: each added / removed / full-list email, with whether it went out.
--  * Data fix (John): trucks 122 and 124 keep the truck sheet's VINs (the sheet John keeps up to date).
-- Safe to run twice.

begin;

alter table public.employees add column if not exists approved_driver boolean not null default false;

create table if not exists public.driver_licenses (
  employee_id    uuid primary key references public.employees(id) on delete cascade,
  license_state  text,
  license_number text,
  birth_date     date,
  home_address   text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.employees(id) on delete set null default public.my_id()
);
alter table public.driver_licenses enable row level security;
revoke all on public.driver_licenses from anon, authenticated;

create table if not exists public.driver_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid references public.employees(id) on delete cascade,
  kind         text not null check (kind in ('added', 'removed', 'list')),
  by_id        uuid references public.employees(id) on delete set null default public.my_id(),
  created_at   timestamptz not null default now(),
  emailed_at   timestamptz,
  email_result text,
  attempts     integer not null default 0
);
create index if not exists driver_events_waiting on public.driver_events (created_at) where emailed_at is null;
alter table public.driver_events enable row level security;
revoke all on public.driver_events from anon, authenticated;

-- Who sees the list (names, trucks, approved or not): managers and up, and the HR approver
create or replace function public.can_see_drivers()
returns boolean language sql stable security definer set search_path = public as $$
  select can_see_trucks() or exists (select 1 from employees e where e.id = my_id() and e.active and e.hr_approver)
$$;
revoke all on function public.can_see_drivers() from public, anon;
grant execute on function public.can_see_drivers() to authenticated;

-- Who sees and changes license details and the switch: C-Suite, the President, the HR approver, with the authenticator step
create or replace function public.can_manage_drivers()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e where e.id = my_id() and e.active and (level_rank(e.level) >= 4 or e.hr_approver))
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
revoke all on function public.can_manage_drivers() from public, anon;
grant execute on function public.can_manage_drivers() to authenticated;

create or replace function public.drivers_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  details boolean := can_manage_drivers();
  result jsonb;
begin
  if not can_see_drivers() then return null; end if;
  select jsonb_build_object(
    'people', (select coalesce(jsonb_agg(x order by x.office nulls last, x.first_name, x.last_name), '[]') from (
        select e.id, e.first_name, e.last_name, e.office, e.department, e.level, e.approved_driver,
               (l.license_number is not null and l.birth_date is not null) as has_license,
               case when details then l.license_state end as license_state,
               case when details then l.license_number end as license_number,
               case when details then l.birth_date end as birth_date,
               case when details then l.home_address end as home_address,
               (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'truck_no', t.truck_no, 'name', concat_ws(' ', t.year, t.make, t.model)) order by t.truck_no), '[]')
                  from trucks t where t.driver_id = e.id and t.status in ('active', 'for_sale')) as trucks,
               (select jsonb_build_object('kind', v.kind, 'created_at', v.created_at, 'emailed_at', v.emailed_at, 'email_result', v.email_result, 'id', v.id)
                  from driver_events v where v.employee_id = e.id order by v.created_at desc limit 1) as last_event
        from employees e left join driver_licenses l on l.employee_id = e.id
        where e.active) x),   -- the wildlife team drives too (Bryan, Sam)
    'last_list', (select jsonb_build_object('created_at', created_at, 'emailed_at', emailed_at, 'email_result', email_result)
                  from driver_events where kind = 'list' order by created_at desc limit 1),
    'agent', (select jsonb_build_object('name', insurance_name, 'email', insurance_email) from fleet_settings where id = 1),
    'details', details,
    'can_switch', details
  ) into result;
  return result;
end $$;
revoke all on function public.drivers_data() from public, anon;
grant execute on function public.drivers_data() to authenticated;

-- License details (no email)
create or replace function public.save_driver_license(p_employee uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_drivers() then raise exception 'Only C-Suite, the President and HR (with the authenticator step) can change license details.'; end if;
  insert into driver_licenses (employee_id) values (p_employee) on conflict (employee_id) do nothing;
  update driver_licenses set
    license_state  = nullif(upper(trim(p ->> 'license_state')), ''),
    license_number = nullif(upper(regexp_replace(coalesce(p ->> 'license_number', ''), '[\s#-]', '', 'g')), ''),
    birth_date     = nullif(p ->> 'birth_date', '')::date,
    home_address   = nullif(trim(p ->> 'home_address'), ''),
    updated_at = now(), updated_by = my_id()
  where employee_id = p_employee;
end $$;
revoke all on function public.save_driver_license(uuid, jsonb) from public, anon;
grant execute on function public.save_driver_license(uuid, jsonb) to authenticated;

-- The switch. Returns the queued email's id (null when nothing changed).
create or replace function public.set_approved_driver(p_employee uuid, p_on boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare was boolean; ev uuid;
begin
  if not can_manage_drivers() then raise exception 'Only C-Suite, the President and HR (with the authenticator step) can change drivers.'; end if;
  select approved_driver into was from employees where id = p_employee;
  if not found then raise exception 'Nobody by that id.'; end if;
  if was = coalesce(p_on, false) then return null; end if;
  if p_on and not exists (select 1 from driver_licenses where employee_id = p_employee and license_number is not null and birth_date is not null) then
    raise exception 'Put in their license number and birth date first (the insurance agent needs both).';
  end if;
  update employees set approved_driver = coalesce(p_on, false), updated_at = now() where id = p_employee;
  insert into driver_events (employee_id, kind) values (p_employee, case when p_on then 'added' else 'removed' end) returning id into ev;
  return ev;
end $$;
revoke all on function public.set_approved_driver(uuid, boolean) from public, anon;
grant execute on function public.set_approved_driver(uuid, boolean) to authenticated;

-- "Send the full driver list" button
create or replace function public.queue_driver_list()
returns uuid language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  if not can_manage_drivers() then raise exception 'Only C-Suite, the President and HR can send the driver list.'; end if;
  insert into driver_events (employee_id, kind) values (null, 'list') returning id into ev;
  return ev;
end $$;
revoke all on function public.queue_driver_list() from public, anon;
grant execute on function public.queue_driver_list() to authenticated;

-- Someone who leaves (switched off in the app or by the sync) comes off the policy too
create or replace function public.driver_leaves()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.active and not new.active and old.approved_driver then
    new.approved_driver := false;
    insert into driver_events (employee_id, kind, by_id) values (new.id, 'removed', my_id());
  end if;
  return new;
end $$;
drop trigger if exists driver_leaves on public.employees;
create trigger driver_leaves before update of active on public.employees for each row execute function driver_leaves();

-- John: 122 and 124 keep the truck sheet's VINs
update public.trucks set vin = '3TYRX5GN5PT072284', updated_at = now() where vin = '3TYRX5GN6PT072284'
  and not exists (select 1 from public.trucks where vin = '3TYRX5GN5PT072284');
update public.trucks set vin = '3TYRX5GN7PT076724', updated_at = now() where vin = '3TYRX5GN6PT076724'
  and not exists (select 1 from public.trucks where vin = '3TYRX5GN7PT076724');

commit;

-- Check
select 'approved drivers' as what, count(*) filter (where approved_driver)::text || ' on the policy' as detail from public.employees where active
union all select 'trucks 122 / 124 VINs', string_agg(truck_no || ' ' || vin, ', ' order by truck_no) from public.trucks where truck_no in ('122', '124');
