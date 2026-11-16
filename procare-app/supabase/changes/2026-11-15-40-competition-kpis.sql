-- 2026-11-15-40 competitions: more things to score, by department.
--   service  = a completed job, credited to the tech who did it (same as "Serviced" on the Technician card)
--   autopay  = now also a rep's serviced sale whose customer is on auto-pay (techs still get auto-pay turned on at a visit)
--   contracts = each serviced pest-control sale (service types in the Pay "pest" group) with its contract value,
--               so the page can give points for contract value tiers (e.g. +0.5 over $420, +0.5 more at $600)
-- Point values stay per competition (competitions.points), including "tiers": [{"over": 420, "pts": 0.5}].

begin;

alter table public.competitions alter column points set default
  '{"sale": 3, "autopay": 2, "review": 1, "review_stars": 5, "service": 0, "tiers": [{"over": 420, "pts": 0.5}]}'::jsonb;

-- Standings data for one competition (change 40 adds services, auto-pay on sales and pest contract values): the members, and points-earning events per member per day
-- (from the start date through today or the end date). The page adds up the points for any window
-- (the whole competition, or one bracket round).
create or replace function public.competition_board(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c competitions;
  today date := (now() at time zone 'America/New_York')::date;
  hi date;
  lo_ts timestamptz;
  hi_ts timestamptz;
  excl text[];
  star_min numeric;
  result jsonb;
begin
  if my_id() is null then return null; end if;
  select * into c from competitions where id = p_id;
  if not found then return null; end if;
  hi := least(c.end_date, today);
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
  ev as (
    -- sale: first service completed, credited to the rep who sold it
    select m.emp, ia.date as day, 'sale'::text as k
    from fr_appointments ia
    join fr_subscriptions s on s.initial_appointment_id = ia.appointment_id
    join idmap m on m.fr_id = s.sold_by
    where hi >= c.start_date and ia.date between c.start_date and hi
      and s.initial_status_text = 'Completed' and not (s.service_type = any (excl))
    union all
    -- service: a completed job, credited to the tech who did it
    select m.emp, a.date, 'service'
    from fr_appointments a
    left join fr_routes rr on rr.route_id = a.route_id
    join idmap m on m.fr_id = coalesce(nullif(a.serviced_by, 0), nullif(a.assigned_tech, 0), rr.assigned_tech)
    where a.date between c.start_date and hi and a.status = 1
    union all
    -- auto-pay on a sale: a serviced sale whose customer is on auto-pay, credited to the rep who sold it
    select m.emp, ia.date, 'autopay'
    from fr_appointments ia
    join fr_subscriptions s on s.initial_appointment_id = ia.appointment_id
    join idmap m on m.fr_id = s.sold_by
    join fr_customers cu on cu.customer_id = s.customer_id
    where ia.date between c.start_date and hi
      and s.initial_status_text = 'Completed' and not (s.service_type = any (excl))
      and coalesce(cu.autopay, '') !~* '^(no|0|false|none|)$'
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
  tally as (select emp, day, k, count(*)::int as n from ev group by 1, 2, 3),
  pest as (   -- serviced pest-control sales and their contract value (for contract value tiers)
    select m.emp, ia.date as day, coalesce(s.contract_value, 0) as cv
    from fr_appointments ia
    join fr_subscriptions s on s.initial_appointment_id = ia.appointment_id
    join idmap m on m.fr_id = s.sold_by
    join comp_service_groups g on g.service_type = s.service_type and g.grp = 'pest'
    where ia.date between c.start_date and hi and s.initial_status_text = 'Completed'
  )
  select jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.emp, 'first_name', m.first_name, 'last_name', m.last_name, 'office', m.office,
                  'photo_url', m.photo_url, 'department', m.department, 'active', m.active, 'team', m.team, 'seed', m.seed)
                  order by m.first_name, m.last_name), '[]') from mem m),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('e', t.emp, 'd', t.day, 'k', t.k, 'n', t.n)), '[]') from tally t),
    'contracts', (select coalesce(jsonb_agg(jsonb_build_object('e', p.emp, 'd', p.day, 'v', p.cv)), '[]') from pest p),
    'through', case when hi >= c.start_date then hi end
  ) into result;
  return result;
end $$;
revoke all on function public.competition_board(uuid) from public, anon;
grant execute on function public.competition_board(uuid) to authenticated;

commit;
