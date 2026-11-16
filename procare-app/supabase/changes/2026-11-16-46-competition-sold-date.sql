-- 2026-11-16-46 competition sales count by SOLD date, with an optional "must be serviced" window.
-- The user (2026-11-16): only sales SOLD during the competition (or bracket round) ever count; nothing sold
-- before it. Optionally (competitions.points.serve_days, e.g. 3 = serviced by 3 days after the end) a sale,
-- its auto-pay and its contract-value bonus only count once its first service is done by that deadline;
-- until then it shows as pending, and it drops off if the deadline passes. Brackets wait for the window.
-- competition_board now returns 'sales' (each sale: rep, sold day, serviced day, auto-pay, contract value, pest)
-- instead of 'sale' / rep auto-pay events and 'contracts'; the app does the counting (lib/competitions.js).

begin;

create or replace function public.competition_board_calc(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c competitions;
  today date := (now() at time zone 'America/New_York')::date;
  hi date;
  lo_ts timestamptz;
  hi_ts timestamptz;
  excl text[];
  star_min numeric;
  serve_days integer;
  sold_hi date;
  result jsonb;
begin
  select * into c from competitions where id = p_id;
  if not found then return null; end if;
  serve_days := nullif(c.points->>'serve_days', '')::integer;   -- null = sales don't need to be serviced
  hi := least(c.end_date + coalesce(serve_days, 0), today);
  sold_hi := least(c.end_date, today);
  lo_ts := (c.start_date::timestamp) at time zone 'America/New_York';
  hi_ts := ((hi + 1)::timestamp) at time zone 'America/New_York';
  select coalesce(exclude_types, '{}') into excl from sales_board_rules where id = 1;
  excl := coalesce(excl, '{}');
  star_min := coalesce((c.points->>'review_stars')::numeric, 5);

  with mem as materialized (
    select m.employee_id as emp, m.team, m.seed, e.first_name, e.last_name, e.office, e.photo_url,
           e.department::text as department, e.active
    from competition_members m join employees e on e.id = m.employee_id
    where m.competition_id = p_id
  ),
  idmap as materialized (   -- FieldRoutes ID → member
    select distinct on (x.fr_id) x.fr_id, m.emp
    from mem m cross join lateral unnest(tech_fr_ids(m.emp)) as x(fr_id)
    order by x.fr_id, m.emp
  ),
  sold as materialized (    -- sales SOLD in the competition (pending or serviced), with when the first service was done
    select s.sold_by, (s.date_added at time zone 'America/New_York')::date as day, s.customer_id, s.service_type,
           coalesce(s.contract_value, 0) as cv,
           case when s.initial_status_text = 'Completed' then coalesce(ia.date, (s.date_added at time zone 'America/New_York')::date) end as served
    from fr_subscriptions s
    left join fr_appointments ia on ia.appointment_id = s.initial_appointment_id
    where sold_hi >= c.start_date
      and s.date_added >= (c.start_date::timestamp at time zone 'America/New_York')
      and s.date_added < ((sold_hi + 1)::timestamp at time zone 'America/New_York')
      and s.initial_status_text in ('Pending', 'Completed')
      and not (s.service_type = any (excl))
  ),
  msold as materialized (   -- …that members sold
    select m.emp, x.day, x.served, x.cv, x.service_type,
           coalesce(cu.autopay, '') !~* '^(no|0|false|none|)$' as ap,
           exists (select 1 from comp_service_groups g where g.service_type = x.service_type and g.grp = 'pest') as pest
    from sold x join idmap m on m.fr_id = x.sold_by
    left join fr_customers cu on cu.customer_id = x.customer_id
  ),
  ev as (
    -- service: a completed job, credited to the tech who did it
    select m.emp, a.date as day, 'service'::text as k
    from fr_appointments a
    left join fr_routes rr on rr.route_id = a.route_id
    join idmap m on m.fr_id = coalesce(nullif(a.serviced_by, 0), nullif(a.assigned_tech, 0), rr.assigned_tech)
    where a.date between c.start_date and hi and a.status = 1
    union all
    -- auto-pay turned on: the tech who completed a job for that customer that same day
    select m.emp, x.day, 'autopay'
    from (
      select distinct ch.customer_id, (ch.changed_at at time zone 'America/New_York')::date as day,
             (select nullif(p.serviced_by, 0) from fr_appointments p
               where p.customer_id = ch.customer_id and p.status = 1
                 and p.date = (ch.changed_at at time zone 'America/New_York')::date
               order by p.date_completed desc nulls last, p.appointment_id desc limit 1) as tech_id
      from fr_autopay_changes ch
      where ch.changed_at >= lo_ts and ch.changed_at < hi_ts
        and coalesce(ch.autopay_before, '') ~* '^(no|0|false|none)?$' and coalesce(ch.autopay_after, '') !~* '^(no|0|false|none)?$'
    ) x join idmap m on m.fr_id = x.tech_id
    union all
    -- review: the tech on the reviewed visit
    select m.emp, (rv.review_date at time zone 'America/New_York')::date, 'review'
    from fr_reviews rv
    left join fr_appointments ra on ra.appointment_id = rv.appointment_id
    join idmap m on m.fr_id = coalesce(nullif(ra.serviced_by, 0), rv.employee_id)
    where rv.review_date >= lo_ts and rv.review_date < hi_ts and rv.stars >= star_min
  ),
  tally as (select emp, day, k, count(*)::int as n from ev group by 1, 2, 3)
  select jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.emp, 'first_name', m.first_name, 'last_name', m.last_name, 'office', m.office,
                  'photo_url', m.photo_url, 'department', m.department, 'active', m.active, 'team', m.team, 'seed', m.seed)
                  order by m.first_name, m.last_name), '[]') from mem m),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('e', t.emp, 'd', t.day, 'k', t.k, 'n', t.n)), '[]') from tally t),
    'sales', (select coalesce(jsonb_agg(jsonb_build_object('e', x.emp, 'd', x.day, 's', x.served, 'ap', x.ap, 'v', x.cv, 'p', x.pest)), '[]') from msold x),
    'contracts', '[]'::jsonb,
    'start', c.start_date, 'end', c.end_date, 'serve_days', serve_days,
    'through', case when hi >= c.start_date then hi end, 'today', today
  ) into result;
  return result;
end $$;
revoke all on function public.competition_board_calc(uuid) from public, anon, authenticated;

delete from public.competition_board_cache;   -- recalculate with the new rules

commit;
