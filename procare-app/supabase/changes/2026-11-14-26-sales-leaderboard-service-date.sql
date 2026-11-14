-- 2026-11-14. Sales Leaderboard: a "by first-service date" view, like FieldRoutes' Sales Report
-- ("Scheduled Between" this month, all initial statuses, active and inactive reps).
--
-- sales_leaderboard(p_from, p_to, p_basis):
--   p_basis 'sold' (default): as in change 25, matching FieldRoutes' Sales Leaderboard (sold date,
--     pending or serviced only, active users).
--   p_basis 'service': sales whose first (initial) appointment falls in the period, every status
--     (serviced, pending, not serviced, canceled), active and inactive reps. Best day and selling
--     days use the first-service date. Checked against FieldRoutes' Sales Report for November 2026:
--     serviced and pending match; not-serviced and canceled sales show only when the app has their
--     first appointment (cancelled appointments mostly aren't copied yet).
-- Same excluded service types (sales_board_rules) either way.

begin;

drop function if exists public.sales_leaderboard(date, date);
drop function if exists public.sales_leaderboard(date, date, text);
create function public.sales_leaderboard(p_from date, p_to date, p_basis text default 'sold')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lo timestamptz := (p_from::timestamp) at time zone 'America/New_York';
  hi timestamptz := ((p_to + 1)::timestamp) at time zone 'America/New_York';
  excl text[];
  by_service boolean := (p_basis = 'service');
  result jsonb;
begin
  if my_id() is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then return null; end if;
  select coalesce(exclude_types, '{}') into excl from sales_board_rules where id = 1;
  excl := coalesce(excl, '{}');

  with fe as materialized (   -- one row per FieldRoutes employee ID
    select distinct on (employee_id) employee_id, office, active, trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) as name
    from fr_employees order by employee_id, active desc nulls last
  ),
  idmap as materialized (     -- FieldRoutes ID → app employee
    select distinct on (x.fr_id::bigint) x.fr_id::bigint as fr_id, e.id as emp
    from employees e cross join lateral unnest(tech_fr_ids(e.id)) as x(fr_id)
    order by x.fr_id::bigint, e.active desc
  ),
  picked as materialized (     -- the sales in the period, by sold date or by first-service date
    select s.*, null::date as service_day from fr_subscriptions s
    where not by_service and s.date_added >= lo and s.date_added < hi
      and s.initial_status_text in ('Pending', 'Completed')
    union all
    select s.*, ia.date from fr_appointments ia join fr_subscriptions s on s.initial_appointment_id = ia.appointment_id
    where by_service and ia.date between p_from and p_to
  ),
  sold as materialized (
    select coalesce(m.emp::text, 'fr:' || s.sold_by) as who, m.emp, s.sold_by, f.office as fr_office, f.name as fr_name,
           (s.date_added at time zone 'America/New_York') as t, s.active,
           coalesce(s.service_day, (s.date_added at time zone 'America/New_York')::date) as day,
           (s.initial_status_text = 'Completed') as serviced, s.initial_status_text as st,
           coalesce(s.contract_value, 0) as cv, coalesce(s.annual_recurring_value, 0) as arv,
           coalesce(s.initial_service_total, 0) as init,
           coalesce(c.autopay, '') !~* '^(no|0|false|none|)$' as ap,
           (coalesce(c.autopay, '') !~* '^(no|0|false|none|)$' and coalesce(p.status, 0) <> 1) as bad_pay,
           s.customer_id
    from picked s
    join fe f on f.employee_id = s.sold_by and (by_service or f.active)
    left join idmap m on m.fr_id = s.sold_by
    left join fr_customers c on c.customer_id = s.customer_id
    left join fr_payment_profiles p on p.payment_profile_id = c.autopay_profile_id
    where not (s.service_type = any (excl))
  ),
  people as materialized (    -- everyone with a sale: name, photo, and the FieldRoutes office most of their sales are under
    select distinct on (s.who) s.who, s.emp,
           coalesce(nullif(regexp_replace(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), '\s+', ' ', 'g'), ''), s.fr_name) as name,
           e.photo_url, s.fr_office as office
    from (select who, emp, fr_office, fr_name, count(*) as n from sold group by who, emp, fr_office, fr_name) s
    left join employees e on e.id = s.emp
    order by s.who, s.n desc
  ),
  knock as materialized (     -- doors by those people in the period
    select coalesce(m.emp::text, 'fr:' || d.employee_id) as who, (d.time_created at time zone 'America/New_York')::date as day
    from fr_doors d left join idmap m on m.fr_id = d.employee_id
    where d.time_created >= lo and d.time_created < hi
  ),
  days as (
    select who, count(distinct day) as n from (
      select who, day from sold union select who, day from knock where who in (select who from people)
    ) x group by who
  ),
  best_day as (
    select distinct on (who) who, day, count(*) as n from sold group by who, day order by who, count(*) desc, day
  ),
  power_hour as (
    select distinct on (who) who, extract(hour from t)::int as hr from sold group by who, extract(hour from t) order by who, count(*) desc, extract(hour from t)
  ),
  reps as (
    select p.who, p.emp, p.name, p.photo_url, p.office,
           count(*) as sold, count(*) filter (where s.serviced) as serviced, count(*) filter (where s.active) as active,
           coalesce(dy.n, 0) as selling_days,
           round(avg(s.init), 2) as avg_init, round(avg(s.init) filter (where s.serviced), 2) as avg_serv_init,
           round(avg(s.cv), 2) as avg_contract, round(avg(s.cv) filter (where s.serviced), 2) as avg_serv_contract,
           sum(s.cv) as total_revenue, coalesce(sum(s.cv) filter (where s.serviced), 0) as total_serv_contract,
           round(avg(s.arv), 2) as avg_arv, sum(s.arv) as total_arv,
           count(*) filter (where s.ap) as ap, count(*) filter (where s.serviced and s.ap) as serv_ap,
           count(distinct s.customer_id) filter (where s.bad_pay) as bad_pay,
           count(*) filter (where s.st = 'Pending') as pending, count(*) filter (where s.st = 'No Show') as not_serviced,
           count(*) filter (where s.st = 'Cancelled') as canceled,
           bd.day as best_day, bd.n as best_day_sold, ph.hr as power_hour,
           (select count(*) from knock k where k.who = p.who) as knocks
    from people p join sold s on s.who = p.who
    left join days dy on dy.who = p.who
    left join best_day bd on bd.who = p.who
    left join power_hour ph on ph.who = p.who
    group by p.who, p.emp, p.name, p.photo_url, p.office, dy.n, bd.day, bd.n, ph.hr
  ),
  grp as (                     -- team and office totals: each sale under its salesperson's FieldRoutes office, like FieldRoutes
    select coalesce(s.fr_office, 'none') as office, s.*
    from sold s
  ),
  totals as (
    select office, count(*) as sold, count(*) filter (where serviced) as serviced, count(*) filter (where active) as active,
           count(distinct day) as selling_days,
           count(*) filter (where st = 'Pending') as pending, count(*) filter (where st = 'No Show') as not_serviced,
           count(*) filter (where st = 'Cancelled') as canceled, round(avg(init) filter (where serviced), 2) as avg_serv_init,
           round(avg(init), 2) as avg_init, sum(cv) as total_revenue, sum(arv) as total_arv,
           count(*) filter (where ap) as ap
    from grp group by grouping sets ((office), ())
  )
  select jsonb_build_object(
    'reps', (select coalesce(jsonb_agg(r order by r.sold desc, r.serviced desc, r.name), '[]') from reps r),
    'offices', (select coalesce(jsonb_agg(t), '[]') from totals t where t.office is not null),
    'team', (select to_jsonb(t) from totals t where t.office is null),
    'excluded', to_jsonb(excl),
    'basis', case when by_service then 'service' else 'sold' end
  ) into result;
  return result;
end $$;
revoke all on function public.sales_leaderboard(date, date, text) from public, anon;
grant execute on function public.sales_leaderboard(date, date, text) to authenticated;

commit;
