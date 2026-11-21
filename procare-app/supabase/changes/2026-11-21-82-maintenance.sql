-- 82 (2026-11-21). Operations → Maintenance: every truck's maintenance in one place, and oil-change reminders (John).
--  * truck_log.service: what a maintenance entry was (oil change, tires, brakes, inspection, other). Oil changes drive
--    the reminders.
--  * trucks.odometer / odometer_at: the real odometer from Samsara (Read Vehicle Statistics), copied every morning;
--    the sheet's miles follow it.
--  * fleet_settings.oil_every_miles / oil_every_months: when an oil change is due (5,000 miles or 6 months, whichever
--    comes first; C-Suite can change them). Due soon = within 500 miles or 2 weeks.
--  * maintenance_data(from, to): the page. Managers and up (can_see_trucks), like the truck sheet.
--  * Email switch oil_change_reminder: Monday mornings, each office's branch managers get the trucks due or overdue.
-- Safe to run twice.

begin;

alter table public.truck_log add column if not exists service text;
alter table public.truck_log drop constraint if exists truck_log_service_check;
alter table public.truck_log add constraint truck_log_service_check check (service is null or service in ('oil', 'tires', 'brakes', 'inspection', 'other'));
-- Earlier entries that say "oil" count as oil changes
update public.truck_log set service = 'oil' where kind = 'maintenance' and service is null and text ~* '\moil\M';

alter table public.trucks add column if not exists odometer integer;
alter table public.trucks add column if not exists odometer_at timestamptz;
alter table public.fleet_settings add column if not exists oil_every_miles integer not null default 5000 check (oil_every_miles > 0);
alter table public.fleet_settings add column if not exists oil_every_months integer not null default 6 check (oil_every_months > 0);

insert into public.notification_settings (key, label, enabled) values
  ('oil_change_reminder', 'Oil changes due or overdue: email each office’s branch managers on Monday mornings', true)
on conflict (key) do nothing;

-- Notes and maintenance, now with the service (the old 6-argument version stays for older pages)
create or replace function public.add_truck_log(p_truck uuid, p_kind text, p_day date, p_text text, p_cost numeric, p_miles integer, p_service text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; d date := coalesce(p_day, (now() at time zone 'America/New_York')::date);
begin
  if not can_see_trucks() then raise exception 'Only managers and up can add notes.'; end if;
  if p_kind not in ('note', 'maintenance') then raise exception 'Pick note or maintenance.'; end if;
  if p_kind = 'maintenance' and p_service is not null and p_service not in ('oil', 'tires', 'brakes', 'inspection', 'other') then raise exception 'Unknown service.'; end if;
  if nullif(trim(coalesce(p_text, '')), '') is null and p_service is null then raise exception 'Write what happened first.'; end if;
  insert into truck_log (truck_id, kind, day, text, cost, miles, service)
  values (p_truck, p_kind, d,
          coalesce(nullif(trim(coalesce(p_text, '')), ''), case p_service when 'oil' then 'Oil change' when 'tires' then 'Tires' when 'brakes' then 'Brakes' when 'inspection' then 'Inspection' else 'Maintenance' end),
          p_cost, p_miles, case when p_kind = 'maintenance' then p_service end)
  returning id into v;
  if p_miles is not null then
    update trucks set mileage = p_miles, mileage_on = d where id = p_truck and (mileage_on is null or mileage_on <= d);
  end if;
  return v;
end $$;
revoke all on function public.add_truck_log(uuid, text, date, text, numeric, integer, text) from public, anon;
grant execute on function public.add_truck_log(uuid, text, date, text, numeric, integer, text) to authenticated;

create or replace function public.maintenance_data(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not can_see_trucks() or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then return null; end if;
  select jsonb_build_object(
    'trucks', (select coalesce(jsonb_agg(x order by x.office nulls last, x.truck_no), '[]') from (
        select t.id, t.truck_no, t.year, t.make, t.model, t.office, t.status, t.driver_note,
               case when d.id is not null then d.first_name || ' ' || d.last_name end as driver,
               t.mileage, t.mileage_on, t.odometer, t.odometer_at,
               (select jsonb_build_object('day', g.day, 'miles', g.miles, 'cost', g.cost)
                  from truck_log g where g.truck_id = t.id and g.kind = 'maintenance' and g.service = 'oil'
                  order by g.day desc, g.created_at desc limit 1) as last_oil
        from trucks t left join employees d on d.id = t.driver_id
        where t.status in ('active', 'for_sale')) x),
    'entries', (select coalesce(jsonb_agg(x order by x.day desc, x.created_at desc), '[]') from (
        select g.id, g.truck_id, g.day, g.text, g.cost, g.miles, g.service, g.created_at, t.truck_no, t.office,
               concat_ws(' ', t.year, t.make, t.model) as vehicle, b.first_name || ' ' || b.last_name as by
        from truck_log g join trucks t on t.id = g.truck_id left join employees b on b.id = g.by_id
        where g.kind = 'maintenance' and g.day between p_from and p_to) x),
    'rules', (select jsonb_build_object('miles', oil_every_miles, 'months', oil_every_months) from fleet_settings where id = 1),
    'can_set_rules', coalesce(my_rank() >= 4, false)
  ) into result;
  return result;
end $$;
revoke all on function public.maintenance_data(date, date) from public, anon;
grant execute on function public.maintenance_data(date, date) to authenticated;

create or replace function public.set_oil_rules(p_miles integer, p_months integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite and the President can change this.'; end if;
  if coalesce(p_miles, 0) < 1000 or coalesce(p_months, 0) < 1 then raise exception 'Use at least 1,000 miles and 1 month.'; end if;
  update fleet_settings set oil_every_miles = p_miles, oil_every_months = p_months where id = 1;
end $$;
revoke all on function public.set_oil_rules(integer, integer) from public, anon;
grant execute on function public.set_oil_rules(integer, integer) to authenticated;

commit;

-- Check
select 'oil change rule' as what, 'every ' || oil_every_miles || ' miles or ' || oil_every_months || ' months' as detail from public.fleet_settings where id = 1
union all
select 'oil changes on file', count(*)::text from public.truck_log where service = 'oil';
