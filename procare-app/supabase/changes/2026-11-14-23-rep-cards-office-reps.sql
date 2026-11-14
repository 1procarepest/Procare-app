-- 2026-11-14. Rep Cards: office cards flip to show each rep's numbers in that office.
-- Same rep_cards() as change 22, plus kind 'rep_office' rows: one per rep per office,
-- counting only the doors, sales and hours in that office, so they add up to the office card.

begin;

drop function if exists public.rep_cards(date, date);
create function public.rep_cards(p_from date, p_to date)
returns table (
  kind text, employee_id uuid, first_name text, last_name text, home_office text, photo_url text,
  office text, week date, reps integer,
  doors integer, convos integer, made_sale integer, call_back integer, gave_pitch integer,
  not_interested integer, not_home integer, never_knock integer, info integer,
  hours numeric, field_days integer,
  services integer, pest integer, termite integer, mosquito integer, new_customers integer, autopay integer,
  serviced integer, pending integer, due integer, canceled integer,
  far numeric, cv_pest numeric, cv_termite numeric, cv_mosquito numeric
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  today date := (now() at time zone 'America/New_York')::date;
  wk_from date;
  lo timestamptz;
  hi timestamptz;
begin
  if my_id() is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then return; end if;
  wk_from := date_trunc('week', p_to)::date - 51 * 7;
  lo := (least(p_from, wk_from)::timestamp) at time zone 'America/New_York';
  hi := ((p_to + 1)::timestamp) at time zone 'America/New_York';

  return query
  with reps as materialized (
    select e.id, e.first_name, e.last_name, e.office, e.photo_url
    from employees e where e.department = 'sales'   -- reps who have left still show for the days they worked
  ),
  idmap as materialized (
    select r.id as emp, x.fr_id::bigint as fr_id from reps r cross join lateral unnest(tech_fr_ids(r.id)) as x(fr_id)
  ),
  dr as materialized (
    select m.emp, d.office, (d.time_created at time zone 'America/New_York') as t, d.status, d.has_info
    from idmap m join fr_doors d on d.employee_id = m.fr_id
    where d.time_created >= lo and d.time_created < hi
  ),
  sl as materialized (
    select m.emp, s.office, (s.date_added at time zone 'America/New_York') as t, s.customer_id,
           case when s.service_type ~* 'mosquito' then 'mosquito' when s.service_type ~* 'termite' then 'termite' else 'pest' end as svc,
           s.initial_status_text as st, a.date as appt_date,
           coalesce(c.autopay !~* '^(no|0|false|)$', coalesce(s.autopay_payment_profile_id, 0) <> 0) as ap,
           coalesce(s.recurring_charge, 0) as rc, s.billing_frequency as bf, coalesce(s.initial_service_total, 0) as it
    from idmap m join fr_subscriptions s on s.sold_by = m.fr_id
    left join fr_appointments a on a.appointment_id = s.initial_appointment_id
    left join fr_customers c on c.customer_id = s.customer_id
    where s.date_added >= lo and s.date_added < hi
      and coalesce(s.frequency, 0) <> 0
      and coalesce(s.initial_appointment_id, 0) <> 0
      and s.initial_status_text in ('Completed', 'Pending', 'No Show', 'Cancelled')
      and s.service_type in ('General Pest Service', 'Termite Baiting System Service', 'Mosquito Service', 'Mosquito Green Treatment')
  ),
  sales as materialized (
    select sl.*, sl.t::date as day, (sl.st = 'Cancelled') as cx,
           round(sl.rc * case
             when sl.bf ~* 'custom' then case when sl.rc <= 50 then 12 when sl.rc < 400 then 4 else 1 end
             when sl.bf ~ '^\d+$' and sl.bf::int between 28 and 400 then greatest(1, round(360.0 / sl.bf::int))
             when sl.bf ~* 'annual' then 1 when sl.bf ~* 'month' then 12 when sl.bf ~* 'quarter' then 4
             when sl.svc = 'mosquito' then 7 else 4 end, 2) as far,
           round(sl.rc * case
             when sl.bf ~* 'custom' then case when sl.rc <= 50 then 12 when sl.rc < 400 then 4 else 1 end
             when sl.bf ~ '^\d+$' and sl.bf::int between 28 and 400 then greatest(1, round(360.0 / sl.bf::int))
             when sl.bf ~* 'annual' then 1 when sl.bf ~* 'month' then 12 when sl.bf ~* 'quarter' then 4
             when sl.svc = 'mosquito' then 6 else 4 end + sl.it, 2) as fycv
    from sl
  ),
  doors as materialized (select dr.*, dr.t::date as day from dr),
  ev as materialized (
    select emp, office, t from doors union all select emp, office, t from sales
  ),
  rep_day as materialized (     -- a rep's hours each day, across offices
    select emp, day, coalesce(sum(gap) filter (where gap <= 60), 0) / 60.0 as hrs
    from (select emp, t::date as day, extract(epoch from t - lag(t) over (partition by emp, t::date order by t)) / 60 as gap from ev) g
    group by emp, day
  ),
  office_day as materialized (  -- the same, split by office
    select emp, office, day, coalesce(sum(gap) filter (where gap <= 60), 0) / 60.0 as hrs
    from (select emp, office, t::date as day, extract(epoch from t - lag(t) over (partition by emp, office, t::date order by t)) / 60 as gap from ev) g
    group by emp, office, day
  ),
  -- one key per row of output: (kind, emp, office, week); each door, sale and hour-day is tagged with the keys it adds to
  dk as (
    select 'rep'::text as k, emp, null::text as off, null::date as wk, d.day, d.status, d.has_info from doors d where day between p_from and p_to
    union all select 'office', null, office, null, d.day, d.status, d.has_info from doors d where day between p_from and p_to
    union all select 'team', null, null, null, d.day, d.status, d.has_info from doors d where day between p_from and p_to
    union all select 'rep_office', emp, office, null, d.day, d.status, d.has_info from doors d where day between p_from and p_to
    union all select 'week', emp, null, date_trunc('week', day)::date, d.day, d.status, d.has_info from doors d where day >= wk_from and day <= p_to
  ),
  sk as (
    select 'rep'::text as k, emp, null::text as off, null::date as wk, s.day, s.customer_id, s.svc, s.st, s.appt_date, s.ap, s.cx, s.far, s.fycv from sales s where day between p_from and p_to
    union all select 'office', null, office, null, s.day, s.customer_id, s.svc, s.st, s.appt_date, s.ap, s.cx, s.far, s.fycv from sales s where day between p_from and p_to
    union all select 'team', null, null, null, s.day, s.customer_id, s.svc, s.st, s.appt_date, s.ap, s.cx, s.far, s.fycv from sales s where day between p_from and p_to
    union all select 'rep_office', emp, office, null, s.day, s.customer_id, s.svc, s.st, s.appt_date, s.ap, s.cx, s.far, s.fycv from sales s where day between p_from and p_to
    union all select 'week', emp, null, date_trunc('week', day)::date, s.day, s.customer_id, s.svc, s.st, s.appt_date, s.ap, s.cx, s.far, s.fycv from sales s where day >= wk_from and day <= p_to
  ),
  hk as (
    select 'rep'::text as k, emp, null::text as off, null::date as wk, hrs from rep_day where day between p_from and p_to
    union all select 'office', null, office, null, hrs from office_day where day between p_from and p_to
    union all select 'team', null, null, null, hrs from office_day where day between p_from and p_to
    union all select 'rep_office', emp, office, null, hrs from office_day where day between p_from and p_to
    union all select 'week', emp, null, date_trunc('week', day)::date, hrs from rep_day where day >= wk_from and day <= p_to
  ),
  dagg as (
    select k, emp, off, wk, count(*)::int as doors,
           count(*) filter (where status between 1 and 4)::int as convos,
           count(*) filter (where status = 3)::int as made_sale, count(*) filter (where status = 1)::int as call_back,
           count(*) filter (where status = 2)::int as gave_pitch, count(*) filter (where status = 4)::int as not_interested,
           count(*) filter (where status = 0)::int as not_home, count(*) filter (where status = 5)::int as never_knock,
           count(*) filter (where has_info)::int as info, count(distinct day)::int as field_days
    from dk group by k, emp, off, wk
  ),
  sagg as (
    select k, emp, off, wk,
           count(*) filter (where not cx)::int as services,
           count(*) filter (where not cx and svc = 'pest')::int as pest,
           count(*) filter (where not cx and svc = 'termite')::int as termite,
           count(*) filter (where not cx and svc = 'mosquito')::int as mosquito,
           count(distinct customer_id) filter (where not cx)::int as new_customers,
           count(distinct customer_id) filter (where not cx and ap)::int as autopay,
           count(*) filter (where st = 'Completed')::int as serviced,
           count(*) filter (where st in ('Pending', 'No Show'))::int as pending,
           count(*) filter (where st = 'No Show' or (st = 'Pending' and appt_date <= today))::int as due,
           count(*) filter (where cx)::int as canceled,
           coalesce(sum(far) filter (where not cx), 0) as far,
           coalesce(sum(fycv) filter (where not cx and svc = 'pest'), 0) as cv_pest,
           coalesce(sum(fycv) filter (where not cx and svc = 'termite'), 0) as cv_termite,
           coalesce(sum(fycv) filter (where not cx and svc = 'mosquito'), 0) as cv_mosquito
    from sk group by k, emp, off, wk
  ),
  hagg as (select k, emp, off, wk, round(sum(hrs), 2) as hours from hk group by k, emp, off, wk),
  racts as (   -- reps active in each office, and in all, during the period
    select 'office'::text as k, office as off, count(distinct emp)::int as reps from ev where t::date between p_from and p_to group by office
    union all select 'team', null, count(distinct emp)::int from ev where t::date between p_from and p_to
  ),
  keys as (
    select k, emp, off, wk from dagg union select k, emp, off, wk from sagg union select k, emp, off, wk from hagg
  )
  select ks.k, ks.emp, r.first_name, r.last_name, r.office, r.photo_url, ks.off, ks.wk, ra.reps,
         coalesce(d.doors, 0), coalesce(d.convos, 0), coalesce(d.made_sale, 0), coalesce(d.call_back, 0), coalesce(d.gave_pitch, 0),
         coalesce(d.not_interested, 0), coalesce(d.not_home, 0), coalesce(d.never_knock, 0), coalesce(d.info, 0),
         coalesce(h.hours, 0), coalesce(d.field_days, 0),
         coalesce(s.services, 0), coalesce(s.pest, 0), coalesce(s.termite, 0), coalesce(s.mosquito, 0),
         coalesce(s.new_customers, 0), coalesce(s.autopay, 0), coalesce(s.serviced, 0), coalesce(s.pending, 0),
         coalesce(s.due, 0), coalesce(s.canceled, 0),
         coalesce(s.far, 0), coalesce(s.cv_pest, 0), coalesce(s.cv_termite, 0), coalesce(s.cv_mosquito, 0)
  from keys ks
  left join reps r on r.id = ks.emp
  left join racts ra on ra.k = ks.k and ra.off is not distinct from ks.off
  left join dagg d on d.k = ks.k and d.emp is not distinct from ks.emp and d.off is not distinct from ks.off and d.wk is not distinct from ks.wk
  left join sagg s on s.k = ks.k and s.emp is not distinct from ks.emp and s.off is not distinct from ks.off and s.wk is not distinct from ks.wk
  left join hagg h on h.k = ks.k and h.emp is not distinct from ks.emp and h.off is not distinct from ks.off and h.wk is not distinct from ks.wk;
end $$;

revoke all on function public.rep_cards(date, date) from public, anon;
grant execute on function public.rep_cards(date, date) to authenticated;

commit;
