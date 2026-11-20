-- 68 (2026-11-19). Wildlife sales by the customer's office, and real dollars for completed visits.
--  * Sold and done are also totaled by the office the customer belongs to (the subscription's / visit's office),
--    not the technician's home office (Bryan and Sam are both set to West). John, 2026-11-19.
--  * "Done" dollars: FieldRoutes stores -1 as the production value on these visits, so the totals read like "$-103".
--    A visit now counts its production value only when it's above zero; otherwise the first visit of a job counts
--    the job's price (Exclusion and Insulation: initial job; Trapping: entire job) and later visits count $0.
--  * The check at the bottom lists who FieldRoutes names as Sales Rep 1 on this year's wildlife sales, and which app
--    person that FieldRoutes ID belongs to (to see why Bryan gets almost every sale).
-- Safe to run twice.

begin;

create or replace function public.wildlife_sales_calc(p_period text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  per record;
  result jsonb;
begin
  select * into per from scorecard_period(coalesce(p_period, 'thisMonth'));
  with team as materialized (
    select e.id, x.fr_id from employees e cross join lateral unnest(tech_fr_ids(e.id)) as x(fr_id)
    where e.active and e.department::text = 'wildlife'
  ),
  wins as (select 'cur'::text as which, per.cur_start as s, per.cur_end as e
           union all select 'prior', per.prior_start, per.prior_end),
  sold_rows as materialized (
    select t.id, w.which, s.office, wildlife_line(s.service_type) as line, coalesce(s.contract_value, 0) as amt
    from wins w
    join fr_subscriptions s on (s.date_added at time zone 'America/New_York')::date between w.s and w.e
    join team t on t.fr_id = s.sold_by
    where wildlife_line(s.service_type) is not null
  ),
  done_rows as materialized (
    select t.id, w.which, a.office, wildlife_line(st.description) as line,
           case when a.production_value > 0 then a.production_value
                when s.initial_appointment_id = a.appointment_id then
                  case when wildlife_line(st.description) = 'trapping' then coalesce(nullif(s.contract_value, 0), s.initial_service_total, 0)
                       else coalesce(s.initial_service_total, 0) end
                else 0 end as amt
    from wins w
    join fr_appointments a on a.date between w.s and w.e and a.status = 1
    join fr_service_types st on st.office = a.office and st.type_id = a.type_id
    join team t on t.fr_id = coalesce(nullif(a.serviced_by, 0), nullif(a.assigned_tech, 0))
    left join fr_subscriptions s on s.subscription_id = a.subscription_id
    where wildlife_line(st.description) is not null
  )
  select jsonb_build_object(
    'sold', (select coalesce(jsonb_agg(x), '[]') from (select id, which, line, count(*) as n, sum(amt) as amt from sold_rows group by 1, 2, 3) x),
    'done', (select coalesce(jsonb_agg(x), '[]') from (select id, which, line, count(*) as n, sum(amt) as amt from done_rows group by 1, 2, 3) x),
    'sold_office', (select coalesce(jsonb_agg(x), '[]') from (select office, which, line, count(*) as n, sum(amt) as amt from sold_rows group by 1, 2, 3) x),
    'done_office', (select coalesce(jsonb_agg(x), '[]') from (select office, which, line, count(*) as n, sum(amt) as amt from done_rows group by 1, 2, 3) x),
    'names', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', st.description, 'line', wildlife_line(st.description))), '[]')
              from fr_service_types st where wildlife_line(st.description) is not null)
  ) into result;
  return result;
end $$;
revoke all on function public.wildlife_sales_calc(text) from public, anon, authenticated;

-- Recalculate the saved wildlife numbers
delete from public.rpc_cache where fn = 'wildlife_sales';

commit;

select public.refresh_saved_reports() as refreshed;

-- Check: who FieldRoutes names as Sales Rep 1 on this year's wildlife sales (and which app person that ID is)
select coalesce(nullif(trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')), ''), 'FieldRoutes ID ' || s.sold_by) as sales_rep_in_fieldroutes,
       s.sold_by as fieldroutes_id, s.office,
       coalesce((select e.first_name || ' ' || e.last_name from public.employees e where s.sold_by = any(public.tech_fr_ids(e.id)) limit 1), '(not in the app)') as app_person,
       count(*) as wildlife_sales
from public.fr_subscriptions s
left join public.fr_employees f on f.employee_id = s.sold_by and f.office = s.office
where public.wildlife_line(s.service_type) is not null
  and s.date_added >= date_trunc('year', now() at time zone 'America/New_York')
group by 1, 2, 3, 4
order by 5 desc;
