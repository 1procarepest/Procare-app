-- 2026-11-15-39 competitions: leaderboards (and later brackets) scored with points.
-- Who competes: people, offices or custom teams. Offices and teams are ranked by average points per member
-- (total ÷ number of members), so bigger groups don't win just by size.
-- Points are set per competition (competitions.points), e.g. {"sale": 3, "autopay": 2, "review": 1, "review_stars": 5}:
--   sale    = a sale's first service completed, on the first-service date, credited to the rep who sold it
--             (same as "Serviced" on the Sales Leaderboard by first-service date, same excluded service types)
--   autopay = auto-pay turned on, credited to the tech who completed a job for that customer that day
--   review  = a review with at least review_stars stars, credited to the tech on the reviewed visit
-- Everyone signed in sees every competition. Managers create competitions for their own department;
-- C-Suite and the President for any departments. The creator (or C-Suite / President) can edit or delete.

begin;

create table if not exists public.competitions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  style       text not null default 'leaderboard' check (style in ('leaderboard', 'bracket')),
  compete_as  text not null default 'people' check (compete_as in ('people', 'offices', 'teams')),
  departments text[] not null check (cardinality(departments) > 0 and departments <@ array['technician', 'sales', 'administrative']),
  start_date  date not null,
  end_date    date not null,
  round_days  integer check (round_days is null or round_days between 1 and 90),   -- brackets: days per round
  prize       text,
  points      jsonb not null default '{"sale": 3, "autopay": 2, "review": 1, "review_stars": 5}'::jsonb,
  created_by  uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 400)
);

create table if not exists public.competition_members (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  team           text,      -- custom teams: the team name
  seed           integer,   -- brackets: seeding order (1 = top seed)
  primary key (competition_id, employee_id)
);
create index if not exists competition_members_emp on public.competition_members (employee_id);

-- May the signed-in person run a competition for these departments?
create or replace function public.can_run_competition(depts text[])
returns boolean language sql stable security definer set search_path = public as $$
  select my_rank() >= 4
      or (my_rank() = 3 and cardinality(depts) = 1 and depts[1] = my_department()::text)
$$;
revoke all on function public.can_run_competition(text[]) from public, anon;
grant execute on function public.can_run_competition(text[]) to authenticated;

-- May the signed-in person change this competition (and its members)?
create or replace function public.can_edit_competition(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c
    where c.id = p_id and can_run_competition(c.departments) and (my_rank() >= 4 or c.created_by = my_id())
  )
$$;
revoke all on function public.can_edit_competition(uuid) from public, anon;
grant execute on function public.can_edit_competition(uuid) to authenticated;

alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;

drop policy if exists competitions_read on public.competitions;
create policy competitions_read on public.competitions for select to authenticated using (my_id() is not null);
drop policy if exists competitions_add on public.competitions;
create policy competitions_add on public.competitions for insert to authenticated
  with check (can_run_competition(departments) and created_by = my_id());
drop policy if exists competitions_change on public.competitions;
create policy competitions_change on public.competitions for update to authenticated
  using (can_edit_competition(id)) with check (can_run_competition(departments));
drop policy if exists competitions_remove on public.competitions;
create policy competitions_remove on public.competitions for delete to authenticated using (can_edit_competition(id));

drop policy if exists competition_members_read on public.competition_members;
create policy competition_members_read on public.competition_members for select to authenticated using (my_id() is not null);
drop policy if exists competition_members_write on public.competition_members;
create policy competition_members_write on public.competition_members for all to authenticated
  using (can_edit_competition(competition_id))
  with check (can_edit_competition(competition_id) and exists (
    select 1 from employees e join competitions c on c.id = competition_id
    where e.id = employee_id and e.department::text = any (c.departments)));

drop trigger if exists log_competitions on public.competitions;
create trigger log_competitions after insert or delete or update on public.competitions for each row execute function log_change();
drop trigger if exists log_competition_members on public.competition_members;
create trigger log_competition_members after insert or delete or update on public.competition_members for each row execute function log_change();

-- Standings data for one competition: the members, and points-earning events per member per day
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
    'through', case when hi >= c.start_date then hi end
  ) into result;
  return result;
end $$;
revoke all on function public.competition_board(uuid) from public, anon;
grant execute on function public.competition_board(uuid) to authenticated;

commit;
