-- 2026-11-14. Sales Leaderboard (a tab in Rep Cards), matching FieldRoutes' Sales Leaderboard
-- with its default filters. Checked against FieldRoutes for Nov 1–14, 2026: 103 sold, $134.91
-- average serviced initial, and the same per-person sold, serviced, contract and recurring numbers.
--
-- Counts a sale (subscription) when:
--   * it was sold in the period (day the account was created, Eastern), credited to the first salesperson;
--   * its first service is Pending or Completed ("Pending / Serviced Accounts": no-shows, cancelled and
--     "No Appointment" sales are left out);
--   * the salesperson is an active FieldRoutes user ("Only Active Users");
--   * its service type isn't on the excluded list in sales_board_rules (FieldRoutes "Excl. Services Types").
-- Office totals group each sale under the salesperson's FieldRoutes office (matches FieldRoutes:
-- East 71, South 19, West 13 for Nov 1–14).
-- Every employee type counts (sales reps, technicians and office staff), like FieldRoutes.
-- People are matched to the app's employees through tech_fr_ids() (all their FieldRoutes IDs); anyone
-- not in the app shows under their FieldRoutes name.
--
-- Not available yet: switch overs, multi-years and paid in fulls (not in the FieldRoutes copy).
-- "Selling days" here = days with a sale or a door knocked (FieldRoutes counts days differently).

begin;

create table if not exists public.sales_board_rules (
  id integer primary key default 1 check (id = 1),
  exclude_types text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.sales_board_rules enable row level security;
drop policy if exists sales_board_rules_read on public.sales_board_rules;
create policy sales_board_rules_read on public.sales_board_rules for select to authenticated using (true);
drop policy if exists sales_board_rules_write on public.sales_board_rules;
create policy sales_board_rules_write on public.sales_board_rules for update to authenticated using (my_rank() >= 4) with check (my_rank() >= 4);
insert into public.sales_board_rules (id, exclude_types) values (1, array[
  'Actisol Treatment', 'Bed Bug Treatment', 'Carpenter Bee Treatment', 'German Roach Treatment',
  'Termite Inspection', 'Indian Meal Moth Treatment', 'Complementary Quote'
]) on conflict (id) do nothing;

drop function if exists public.sales_leaderboard(date, date);
create function public.sales_leaderboard(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lo timestamptz := (p_from::timestamp) at time zone 'America/New_York';
  hi timestamptz := ((p_to + 1)::timestamp) at time zone 'America/New_York';
  excl text[];
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
  sold as materialized (
    select coalesce(m.emp::text, 'fr:' || s.sold_by) as who, m.emp, s.sold_by, f.office as fr_office, f.name as fr_name,
           (s.date_added at time zone 'America/New_York') as t, s.active,
           (s.initial_status_text = 'Completed') as serviced,
           coalesce(s.contract_value, 0) as cv, coalesce(s.annual_recurring_value, 0) as arv,
           coalesce(s.initial_service_total, 0) as init,
           coalesce(c.autopay, '') !~* '^(no|0|false|none|)$' as ap,
           (coalesce(c.autopay, '') !~* '^(no|0|false|none|)$' and coalesce(p.status, 0) <> 1) as bad_pay,
           s.customer_id
    from fr_subscriptions s
    join fe f on f.employee_id = s.sold_by and f.active
    left join idmap m on m.fr_id = s.sold_by
    left join fr_customers c on c.customer_id = s.customer_id
    left join fr_payment_profiles p on p.payment_profile_id = c.autopay_profile_id
    where s.date_added >= lo and s.date_added < hi
      and s.initial_status_text in ('Pending', 'Completed')
      and not (s.service_type = any (excl))
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
      select who, t::date as day from sold union select who, day from knock where who in (select who from people)
    ) x group by who
  ),
  best_day as (
    select distinct on (who) who, t::date as day, count(*) as n from sold group by who, t::date order by who, count(*) desc, t::date
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
           count(distinct t::date) as selling_days, round(avg(init) filter (where serviced), 2) as avg_serv_init,
           round(avg(init), 2) as avg_init, sum(cv) as total_revenue, sum(arv) as total_arv,
           count(*) filter (where ap) as ap
    from grp group by grouping sets ((office), ())
  )
  select jsonb_build_object(
    'reps', (select coalesce(jsonb_agg(r order by r.sold desc, r.serviced desc, r.name), '[]') from reps r),
    'offices', (select coalesce(jsonb_agg(t), '[]') from totals t where t.office is not null),
    'team', (select to_jsonb(t) from totals t where t.office is null),
    'excluded', to_jsonb(excl)
  ) into result;
  return result;
end $$;
revoke all on function public.sales_leaderboard(date, date) from public, anon;
grant execute on function public.sales_leaderboard(date, date) to authenticated;

commit;
