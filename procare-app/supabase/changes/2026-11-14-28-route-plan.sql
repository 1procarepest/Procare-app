-- Route plan (Operations → Route plan, /ops/route-plan)
--
-- For each office and day (Sundays left out), which FieldRoutes route template each technician gets
-- and their hours, from the app's schedules plus approved time off. Copy-paste text for Route Builder.
--
-- Rules (from the President, 2026-11-14):
--   Everyone starts on "16 Spot Route" in their home office. The office team changes it on the page:
--     route_plan_usual = a tech's usual template / office for a weekday (Mon–Sat), every week.
--     route_plan_days  = one day only (wins over the usual).
--   Part of a day off: keep the template and block the spots they're not working (the page works that out).
--   route_plan_builds = when an office's month was built in FieldRoutes. Schedule edits and time off
--     decided after that are listed on the page as changes to make by hand.
-- Who: can_see_ops() (office staff, leads and up) can read and change all of it.

create table if not exists public.route_plan_usual (
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 6),
  template    text not null check (length(trim(template)) > 0),
  office      text references public.offices(key),
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, weekday)
);

create table if not exists public.route_plan_days (
  employee_id uuid not null references public.employees(id) on delete cascade,
  day         date not null,
  template    text not null check (length(trim(template)) > 0),
  office      text references public.offices(key),
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, day)
);

create table if not exists public.route_plan_builds (
  office   text not null references public.offices(key),
  month    date not null check (extract(day from month) = 1),
  built_at timestamptz not null default now(),
  built_by uuid references public.employees(id) default public.my_id(),
  primary key (office, month)
);

alter table public.route_plan_usual  enable row level security;
alter table public.route_plan_days   enable row level security;
alter table public.route_plan_builds enable row level security;

drop policy if exists route_plan_usual_all on public.route_plan_usual;
create policy route_plan_usual_all on public.route_plan_usual
  for all to authenticated using (can_see_ops()) with check (can_see_ops());
drop policy if exists route_plan_days_all on public.route_plan_days;
create policy route_plan_days_all on public.route_plan_days
  for all to authenticated using (can_see_ops()) with check (can_see_ops());
drop policy if exists route_plan_builds_all on public.route_plan_builds;
create policy route_plan_builds_all on public.route_plan_builds
  for all to authenticated using (can_see_ops()) with check (can_see_ops());

drop trigger if exists log_route_plan_usual on public.route_plan_usual;
create trigger log_route_plan_usual after insert or delete or update on public.route_plan_usual
  for each row execute function log_change();
drop trigger if exists log_route_plan_days on public.route_plan_days;
create trigger log_route_plan_days after insert or delete or update on public.route_plan_days
  for each row execute function log_change();
drop trigger if exists log_route_plan_builds on public.route_plan_builds;
create trigger log_route_plan_builds after insert or delete or update on public.route_plan_builds
  for each row execute function log_change();

-- Everything the page needs for p_from..p_to, as one JSON object. Time off notes and PTO are left out.
create or replace function public.route_plan_data(p_from date, p_to date)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  m_from date := date_trunc('month', p_from)::date;
  m_to   date := date_trunc('month', p_to)::date;
  since  timestamptz;
begin
  if not can_see_ops() then raise exception 'Not allowed'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Pick a range of 2 months or less'; end if;

  select min(built_at) into since from route_plan_builds where month between m_from and m_to;

  return json_build_object(
    'techs', (select coalesce(json_agg(json_build_object('id', e.id, 'first', e.first_name, 'last', e.last_name, 'office', e.office)
                                       order by e.first_name, e.last_name), '[]')
              from employees e where e.active and e.department = 'technician'),
    'schedules', (select coalesce(json_agg(json_build_object('id', s.employee_id, 'wd', s.weekday, 's', s.start_time, 'e', s.end_time)), '[]')
                  from schedules s join employees e on e.id = s.employee_id
                  where e.active and e.department = 'technician' and s.start_time is not null),
    'timeoff', (select coalesce(json_agg(json_build_object('id', t.employee_id, 'from', t.start_date, 'to', t.end_date, 's', t.start_time, 'e', t.end_time)), '[]')
                from time_off_requests t join employees e on e.id = t.employee_id
                where e.department = 'technician' and t.status = 'approved' and t.start_date <= p_to and t.end_date >= p_from),
    'usual', (select coalesce(json_agg(json_build_object('id', u.employee_id, 'wd', u.weekday, 'template', u.template, 'office', u.office)), '[]')
              from route_plan_usual u),
    'days', (select coalesce(json_agg(json_build_object('id', d.employee_id, 'day', d.day, 'template', d.template, 'office', d.office)), '[]')
             from route_plan_days d where d.day between p_from and p_to),
    'builds', (select coalesce(json_agg(json_build_object('office', b.office, 'month', b.month, 'at', b.built_at,
                                                          'by', (select first_name || ' ' || last_name from employees where id = b.built_by))), '[]')
               from route_plan_builds b where b.month between m_from and m_to),
    -- Schedule and time off edits for technicians since the earliest build in range (the page sorts out which apply).
    'changes', (select coalesce(json_agg(json_build_object(
                  'at', l.created_at, 'table', l.table_name, 'action', l.action,
                  'id', coalesce(l.after ->> 'employee_id', l.before ->> 'employee_id'),
                  'before', case when l.table_name = 'schedules' then l.before
                                 else l.before - 'note' - 'decision_note' - 'use_pto' end,
                  'after', case when l.table_name = 'schedules' then l.after
                                else l.after - 'note' - 'decision_note' - 'use_pto' end,
                  'by', (select first_name || ' ' || last_name from employees where id = l.actor_id)) order by l.created_at), '[]')
                from activity_log l
                join employees e on e.id::text = coalesce(l.after ->> 'employee_id', l.before ->> 'employee_id')
                where since is not null and l.created_at > since and e.department = 'technician'
                  and l.table_name in ('schedules', 'time_off_requests')),
    -- Route template names used in FieldRoutes, for the pick lists.
    'templates', (select coalesce(json_agg(json_build_object('office', office, 'title', title, 'n', n)), '[]')
                  from (select office, title, count(*) n from fr_routes where coalesce(trim(title), '') <> '' group by 1, 2) x)
  );
end $$;
revoke all on function public.route_plan_data(date, date) from public, anon;
grant execute on function public.route_plan_data(date, date) to authenticated;
