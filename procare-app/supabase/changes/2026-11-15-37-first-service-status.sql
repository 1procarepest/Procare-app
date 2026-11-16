-- 2026-11-15-37 clearer first-service status on the pay statement. FieldRoutes marks a first service
-- "No Show" whenever the tech couldn't do it (weather, customer asked to move it, and so on), so the
-- statement shows Serviced / Scheduled / Rescheduled / Needs a new date / Canceled instead.
-- comp_sales() 'open' rows now also return whether the service is still active (live) and the
-- customer's next booked appointment after the first one (next).

begin;

create or replace function public.comp_sales(p_year integer, p_emp uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  boss boolean := can_manage_pay();
  who uuid := case when can_manage_pay() then p_emp else my_id() end;
  lo date := make_date(p_year - 1, 1, 1);
  hi date := make_date(p_year, 12, 31);
  result jsonb;
begin
  if my_id() is null or p_year is null or p_year < 2024 or p_year > 2100 then return null; end if;

  with idmap as materialized (
    select distinct on (x.fr_id::bigint) x.fr_id::bigint as fr_id, e.id as emp
    from employees e cross join lateral unnest(tech_fr_ids(e.id)) as x(fr_id)
    where e.department = 'sales' and (who is null or e.id = who)
    order by x.fr_id::bigint, e.active desc
  ),
  sales as materialized (
    select m.emp, s.subscription_id as id, s.customer_id as cid, c.first_name as first, coalesce(c.last_name, c.company_name) as cust, g.grp,
           (s.date_added at time zone 'America/New_York')::date as sold,
           coalesce(ia.date, (s.date_added at time zone 'America/New_York')::date) as served,
           coalesce(s.annual_recurring_value, 0) + coalesce(s.initial_service_total, 0) as cv,
           coalesce(s.initial_service_total, 0) as init,
           coalesce(s.date_cancelled, case when not coalesce(s.active, true) then c.date_cancelled end) as cancelled,
           coalesce(c.balance, 0) as bal, coalesce(c.balance_age, 0) as age
    from fr_subscriptions s
    join comp_service_groups g on g.service_type = s.service_type
    join idmap m on m.fr_id = s.sold_by
    left join fr_appointments ia on ia.appointment_id = s.initial_appointment_id
    left join fr_customers c on c.customer_id = s.customer_id
    where s.initial_status_text = 'Completed'
      and s.date_added >= ((lo - 60)::timestamp at time zone 'America/New_York')
  ),
  picked as (select * from sales where served between lo and hi),
  open_sales as (             -- sold this year, first service not done (pending, no-show or canceled before service)
    select m.emp, s.subscription_id as id, s.customer_id as cid, c.first_name as first, coalesce(c.last_name, c.company_name) as cust, g.grp,
           (s.date_added at time zone 'America/New_York')::date as sold, s.initial_status_text as st,
           coalesce(s.annual_recurring_value, 0) + coalesce(s.initial_service_total, 0) as cv,
           coalesce(s.initial_service_total, 0) as init, ia.date as initial_on,
           coalesce(s.active, true) and s.date_cancelled is null as live,
           (select min(a.date) from fr_appointments a
             where a.customer_id = s.customer_id and a.date >= (now() at time zone 'America/New_York')::date
               and a.appointment_id is distinct from s.initial_appointment_id
               and a.date_cancelled is null and coalesce(a.status_text, '') !~* '(cancel|no show|complete)') as next_on
    from fr_subscriptions s
    join comp_service_groups g on g.service_type = s.service_type
    join idmap m on m.fr_id = s.sold_by
    left join fr_appointments ia on ia.appointment_id = s.initial_appointment_id
    left join fr_customers c on c.customer_id = s.customer_id
    where coalesce(s.initial_status_text, '') <> 'Completed'
      and s.date_added >= (make_date(p_year, 1, 1)::timestamp at time zone 'America/New_York')
      and s.date_added < ((hi + 1)::timestamp at time zone 'America/New_York')
  ),
  people as (
    select e.id, trim(e.first_name || ' ' || e.last_name) as name, e.office, e.active, e.photo_url
    from employees e
    where e.department = 'sales' and (who is null or e.id = who)
      and (e.active or e.id in (select emp from picked)
           or e.id in (select employee_id from comp_assignments where year in (p_year - 1, p_year)))
  )
  select jsonb_build_object(
    'year', p_year,
    'boss', boss,
    'settings', (select to_jsonb(cs) - 'updated_by' from comp_settings cs where cs.id = 1),
    'groups', (select coalesce(jsonb_object_agg(service_type, grp), '{}') from comp_service_groups),
    'types', case when boss then (select coalesce(jsonb_agg(distinct service_type), '[]') from fr_subscriptions
                                 where service_type is not null and date_added >= (lo::timestamp at time zone 'America/New_York')) end,
    'reps', (select coalesce(jsonb_agg(p order by p.active desc, p.name), '[]') from people p),
    'plans', (select coalesce(jsonb_agg(a), '[]') from comp_assignments a join people p on p.id = a.employee_id
              where a.year in (p_year - 1, p_year)),
    'sales', (select coalesce(jsonb_agg(jsonb_build_object('e', emp, 'id', id, 'cid', cid, 'f', first, 'c', cust, 'g', grp, 'sold', sold,
              'served', served, 'cv', cv, 'init', init, 'can', cancelled, 'bal', bal, 'age', age) order by served), '[]') from picked),
    'open', (select coalesce(jsonb_agg(jsonb_build_object('e', emp, 'id', id, 'cid', cid, 'f', first, 'c', cust, 'g', grp, 'sold', sold, 'st', st,
              'cv', cv, 'init', init, 'on', initial_on, 'live', live, 'next', next_on) order by sold), '[]') from open_sales)
  ) into result;
  return result;
end $$;
revoke all on function public.comp_sales(integer, uuid) from public, anon;
grant execute on function public.comp_sales(integer, uuid) to authenticated;

commit;
