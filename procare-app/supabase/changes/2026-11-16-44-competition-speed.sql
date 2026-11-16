-- 2026-11-16-44 competition standings: faster, and kept for 5 minutes.
-- On 2026-11-16 at about 10:15 many people opened the app at once and Supabase timed out (8 s limit):
-- competition_board took about 2.5 s each, because the planner sometimes walked every sale each rep
-- ever made. Now:
--   * the serviced sales in the period are found by appointment date first (a few milliseconds);
--   * competition_board() keeps each competition's result for 5 minutes (competition_board_cache),
--     so a page full of competition cards doesn't recalculate them for every person;
--   * the saved copy is dropped whenever the competition or its members change (e.g. a bracket locks).

begin;

create table if not exists public.competition_board_cache (
  competition_id uuid primary key references public.competitions(id) on delete cascade,
  data           jsonb not null,
  computed_at    timestamptz not null default now()
);
alter table public.competition_board_cache enable row level security;   -- no policies: only the functions below use it

-- The calculation itself (same results as change 40). Not callable from the app directly.
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
  result jsonb;
begin
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
  sales as materialized (   -- serviced sales whose first service is in the period, found by date first
    select ia.date as day, s.sold_by, s.customer_id, s.service_type, coalesce(s.contract_value, 0) as cv
    from fr_appointments ia
    join fr_subscriptions s on s.initial_appointment_id = ia.appointment_id
    where hi >= c.start_date and ia.date between c.start_date and hi and s.initial_status_text = 'Completed'
  ),
  msales as materialized (  -- …that members sold
    select m.emp, x.day, x.customer_id, x.service_type, x.cv
    from sales x join idmap m on m.fr_id = x.sold_by
  ),
  ev as (
    -- sale: first service completed, credited to the rep who sold it
    select emp, day, 'sale'::text as k from msales where not (service_type = any (excl))
    union all
    -- service: a completed job, credited to the tech who did it
    select m.emp, a.date, 'service'
    from fr_appointments a
    left join fr_routes rr on rr.route_id = a.route_id
    join idmap m on m.fr_id = coalesce(nullif(a.serviced_by, 0), nullif(a.assigned_tech, 0), rr.assigned_tech)
    where a.date between c.start_date and hi and a.status = 1
    union all
    -- auto-pay on a sale: a serviced sale whose customer is on auto-pay, credited to the rep who sold it
    select x.emp, x.day, 'autopay'
    from msales x join fr_customers cu on cu.customer_id = x.customer_id
    where not (x.service_type = any (excl)) and coalesce(cu.autopay, '') !~* '^(no|0|false|none|)$'
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
    select x.emp, x.day, x.cv from msales x
    join comp_service_groups g on g.service_type = x.service_type and g.grp = 'pest'
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
revoke all on function public.competition_board_calc(uuid) from public, anon, authenticated;

-- What the app calls: the saved result if it's under 5 minutes old, otherwise a fresh one (and saves it).
create or replace function public.competition_board(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  hit jsonb;
  fresh jsonb;
begin
  if my_id() is null then return null; end if;
  select data into hit from competition_board_cache
  where competition_id = p_id and computed_at > now() - interval '5 minutes';
  if hit is not null then return hit; end if;
  fresh := competition_board_calc(p_id);
  if fresh is not null then
    insert into competition_board_cache (competition_id, data, computed_at) values (p_id, fresh, now())
    on conflict (competition_id) do update set data = excluded.data, computed_at = excluded.computed_at;
  end if;
  return fresh;
end $$;
revoke all on function public.competition_board(uuid) from public, anon;
grant execute on function public.competition_board(uuid) to authenticated;

-- Drop the saved copy when a competition or its people change, so edits show right away.
create or replace function public.forget_board_for_competition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from competition_board_cache where competition_id = coalesce(new.id, old.id);
  return null;
end $$;
create or replace function public.forget_board_for_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from competition_board_cache where competition_id = coalesce(new.competition_id, old.competition_id);
  return null;
end $$;
drop trigger if exists forget_board_competition on public.competitions;
create trigger forget_board_competition after update on public.competitions
  for each row execute function forget_board_for_competition();
drop trigger if exists forget_board_member on public.competition_members;
create trigger forget_board_member after insert or update or delete on public.competition_members
  for each row execute function forget_board_for_member();

commit;
