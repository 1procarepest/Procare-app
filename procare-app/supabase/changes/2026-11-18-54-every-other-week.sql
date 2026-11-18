-- 2026-11-18 (change 54). Every-other-week schedules: every other Saturday, every other Monday, or swapping two
-- days every other week (Rachel's Thursday and Friday).
--
-- schedule_rotations: one row per person who alternates. a_week is the Monday of a "week A": weeks an even number
--   of weeks from it are A weeks (the usual schedules rows), the others are B weeks.
-- schedule_alt: that person's hours on B weeks, only for the days that differ. Both times empty = off that day.
-- team_schedule() and route_plan_data() now also return 'alt' and 'rot' so the pages can pick the right hours.
begin;

create table if not exists public.schedule_rotations (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  a_week      date not null check (extract(isodow from a_week) = 1),
  updated_at  timestamptz not null default now()
);

create table if not exists public.schedule_alt (
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time,
  end_time    time,
  primary key (employee_id, weekday),
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time < end_time))
);

-- Same rules as schedules: you, your managers and schedule editors can read; schedule editors can change.
alter table public.schedule_rotations enable row level security;
alter table public.schedule_alt enable row level security;
drop policy if exists schedule_rotations_read on public.schedule_rotations;
create policy schedule_rotations_read on public.schedule_rotations for select to authenticated
  using ((employee_id = my_id()) or can_manage(employee_id) or can_edit_schedule(employee_id));
drop policy if exists schedule_rotations_write on public.schedule_rotations;
create policy schedule_rotations_write on public.schedule_rotations for all to authenticated
  using (can_edit_schedule(employee_id)) with check (can_edit_schedule(employee_id));
drop policy if exists schedule_alt_read on public.schedule_alt;
create policy schedule_alt_read on public.schedule_alt for select to authenticated
  using ((employee_id = my_id()) or can_manage(employee_id) or can_edit_schedule(employee_id));
drop policy if exists schedule_alt_write on public.schedule_alt;
create policy schedule_alt_write on public.schedule_alt for all to authenticated
  using (can_edit_schedule(employee_id)) with check (can_edit_schedule(employee_id));

drop trigger if exists log_schedule_rotations on public.schedule_rotations;
create trigger log_schedule_rotations after insert or delete or update on public.schedule_rotations
  for each row execute function log_change();
drop trigger if exists log_schedule_alt on public.schedule_alt;
create trigger log_schedule_alt after insert or delete or update on public.schedule_alt
  for each row execute function log_change();

create or replace function public.team_schedule(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  depts text[] := team_schedule_depts();
  result jsonb;
begin
  if my_id() is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 or cardinality(depts) = 0 then
    return null;
  end if;
  with people as (
    select e.id, e.first_name, e.last_name, e.office, e.department::text as department, e.level::text as level, e.photo_url
    from employees e
    where e.active and e.department::text = any (depts)
  )
  select jsonb_build_object(
    'depts', to_jsonb(depts),
    'people', (select coalesce(jsonb_agg(p order by p.department, p.first_name, p.last_name), '[]') from people p),
    'schedules', (select coalesce(jsonb_agg(jsonb_build_object('e', s.employee_id, 'd', s.weekday, 's', s.start_time, 'x', s.end_time)), '[]')
                  from schedules s join people p on p.id = s.employee_id),
    'alt', (select coalesce(jsonb_agg(jsonb_build_object('e', s.employee_id, 'd', s.weekday, 's', s.start_time, 'x', s.end_time)), '[]')
            from schedule_alt s join people p on p.id = s.employee_id),
    'rot', (select coalesce(jsonb_agg(jsonb_build_object('e', r.employee_id, 'a', r.a_week)), '[]')
            from schedule_rotations r join people p on p.id = r.employee_id),
    'off', (select coalesce(jsonb_agg(jsonb_build_object('e', t.employee_id, 'a', t.start_date, 'b', t.end_date,
                    's', t.start_time, 'x', t.end_time, 'st', t.status)), '[]')
            from time_off_requests t join people p on p.id = t.employee_id
            where t.status in ('pending', 'approved') and t.start_date <= p_to and t.end_date >= p_from)
  ) into result;
  return result;
end $$;
revoke all on function public.team_schedule(date, date) from public, anon;
grant execute on function public.team_schedule(date, date) to authenticated;

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
    'alt', (select coalesce(json_agg(json_build_object('id', s.employee_id, 'wd', s.weekday, 's', s.start_time, 'e', s.end_time)), '[]')
            from schedule_alt s join employees e on e.id = s.employee_id where e.active and e.department = 'technician'),
    'rot', (select coalesce(json_agg(json_build_object('id', r.employee_id, 'a', r.a_week)), '[]')
            from schedule_rotations r join employees e on e.id = r.employee_id where e.active and e.department = 'technician'),
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

commit;
