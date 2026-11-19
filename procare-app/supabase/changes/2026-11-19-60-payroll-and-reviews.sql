-- 60 (2026-11-19). For Ally (HR approver): a payroll time-off list, sick / called-out entries, and year reviews.
--  1. time_off_requests.kind: 'time_off' (a request), 'sick' or 'called_out'. entered_by: who logged it.
--     Approvers (Ally, the President; sales managers for sales) can log time off for someone else. What they log
--     is approved right away. People asking for themselves still go through approval as before.
--  2. payroll_data(from, to): approved time off overlapping the dates plus the schedules needed to turn it into
--     hours. For the HR approver, the President and C-Suite. Sales (1099) are left out.
--  3. employee_reviews: year reviews (G.R.E.E.N. ratings and notes). Written by the HR approver, C-Suite, the
--     President and the person's managers. The employee sees a review once it's shared with them.
-- Safe to run twice.

begin;

-- 1. Sick / called out -----------------------------------------------------------------------------------
alter table public.time_off_requests add column if not exists kind text not null default 'time_off';
alter table public.time_off_requests add column if not exists entered_by uuid references public.employees(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'time_off_kind') then
    alter table public.time_off_requests add constraint time_off_kind check (kind in ('time_off', 'sick', 'called_out'));
  end if;
end $$;

drop policy if exists time_off_insert on public.time_off_requests;
create policy time_off_insert on public.time_off_requests
  for insert to public
  with check (employee_id = my_id() or can_approve_time_off(employee_id));

create or replace function public.guard_time_off()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor public.employees;
begin
  if auth.uid() is null then return new; end if;
  select * into actor from public.employees e where e.auth_user_id = auth.uid() and e.active;

  if tg_op = 'INSERT' then
    new.decision_note := null;
    new.entered_by := actor.id;
    if new.employee_id is distinct from actor.id and public.can_approve_time_off(new.employee_id) then
      -- Logged by an approver for someone else (e.g. Ally marking a sick day): approved right away (change 60).
      new.status := 'approved';
      new.decided_by := actor.id;
      new.decided_at := now();
      if exists (select 1 from public.employees t where t.id = new.employee_id and t.department = 'sales') then
        new.use_pto := false;
      end if;
      return new;
    end if;
    new.kind := 'time_off';   -- only approvers log sick / called-out days
    if exists (select 1 from public.employees t where t.id = new.employee_id and t.department = 'sales') then
      -- Sales notice (1099): confirmed right away, never paid time off.
      new.status := 'approved';
      new.decided_by := actor.id;
      new.decided_at := now();
      new.use_pto := false;
    else
      new.status := 'pending';
      new.decided_by := null;
      new.decided_at := null;
    end if;
    return new;
  end if;

  if public.can_approve_time_off(old.employee_id) then
    if new.status is distinct from old.status and new.status in ('approved', 'denied') then
      new.decided_by := actor.id;
      new.decided_at := now();
    end if;
    return new;
  end if;

  if old.employee_id = actor.id and old.status = 'pending' and new.status = 'cancelled' then
    new := old;
    new.status := 'cancelled';
    return new;
  end if;

  raise exception 'Only the approver can approve or deny this time off';
end
$$;

-- 2. Payroll data ----------------------------------------------------------------------------------------
create or replace function public.can_see_payroll()
returns boolean language sql stable security definer set search_path = public as $$
  select is_hr_approver() or coalesce(my_rank() >= 4, false)
$$;
revoke all on function public.can_see_payroll() from public, anon;
grant execute on function public.can_see_payroll() to authenticated;

create or replace function public.payroll_data(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not can_see_payroll() or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then return null; end if;
  with offs as (
    select r.* from time_off_requests r join employees e on e.id = r.employee_id
    where r.status = 'approved' and r.start_date <= p_to and r.end_date >= p_from and e.department <> 'sales'
  ),
  ids as (select distinct employee_id as id from offs)
  select jsonb_build_object(
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'first_name', e.first_name, 'last_name', e.last_name,
                 'office', e.office, 'department', e.department, 'level', e.level, 'active', e.active) order by e.last_name, e.first_name), '[]')
               from employees e where e.id in (select id from ids)),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name, 'office', e.office)
                 order by e.first_name, e.last_name), '[]')
              from employees e where e.active and e.department <> 'sales'),
    'off', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'e', o.employee_id, 'a', o.start_date, 'b', o.end_date,
                 's', o.start_time, 'x', o.end_time, 'pto', o.use_pto, 'kind', o.kind, 'note', o.note) order by o.start_date), '[]') from offs o),
    'schedules', (select coalesce(jsonb_agg(jsonb_build_object('e', s.employee_id, 'd', s.weekday, 's', s.start_time, 'x', s.end_time)), '[]')
                  from schedules s where s.employee_id in (select id from ids)),
    'alt', (select coalesce(jsonb_agg(jsonb_build_object('e', s.employee_id, 'd', s.weekday, 's', s.start_time, 'x', s.end_time)), '[]')
            from schedule_alt s where s.employee_id in (select id from ids)),
    'rot', (select coalesce(jsonb_agg(jsonb_build_object('e', r.employee_id, 'a', r.a_week)), '[]')
            from schedule_rotations r where r.employee_id in (select id from ids)),
    'holidays', (select coalesce(jsonb_agg(jsonb_build_object('key', h.key, 'enabled', h.enabled)), '[]') from company_holidays h where h.enabled)
  ) into result;
  return result;
end $$;
revoke all on function public.payroll_data(date, date) from public, anon;
grant execute on function public.payroll_data(date, date) to authenticated;

-- 3. Year reviews ----------------------------------------------------------------------------------------
create table if not exists public.employee_reviews (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  year        integer not null check (year between 2020 and 2100),
  review_date date not null default current_date,
  reviewer_id uuid references public.employees(id) on delete set null default public.my_id(),
  ratings     jsonb not null default '{}'::jsonb,   -- { growth, relationships, grind, ownership, stewardship }: 1 to 5
  strengths   text,
  growth      text,       -- areas to grow
  goals       text,       -- goals for next year
  notes       text,       -- overall comments
  shared      boolean not null default false,       -- the employee sees it once shared
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists employee_reviews_emp on public.employee_reviews (employee_id, year desc);

create or replace function public.can_review(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target is distinct from my_id() and (is_hr_approver() or coalesce(my_rank() >= 4, false) or can_manage(target))
$$;
revoke all on function public.can_review(uuid) from public, anon;
grant execute on function public.can_review(uuid) to authenticated;

-- The people the signed-in person may review, with how many reviews each has and the latest year
create or replace function public.review_people()
returns table (id uuid, first_name text, last_name text, office text, department text, level text, reviews bigint, last_year integer)
language sql stable security definer set search_path = public as $$
  select e.id, e.first_name, e.last_name, e.office, e.department::text, e.level::text,
         (select count(*) from employee_reviews r where r.employee_id = e.id),
         (select max(r.year) from employee_reviews r where r.employee_id = e.id)
  from employees e
  where e.active and can_review(e.id)
  order by e.first_name, e.last_name
$$;
revoke all on function public.review_people() from public, anon;
grant execute on function public.review_people() to authenticated;

alter table public.employee_reviews enable row level security;
drop policy if exists reviews_read on public.employee_reviews;
create policy reviews_read on public.employee_reviews for select to authenticated
  using (can_review(employee_id) or (employee_id = my_id() and shared));
drop policy if exists reviews_write on public.employee_reviews;
create policy reviews_write on public.employee_reviews for all to authenticated
  using (can_review(employee_id)) with check (can_review(employee_id));
grant select, insert, update, delete on public.employee_reviews to authenticated;

drop trigger if exists log_employee_reviews on public.employee_reviews;
create trigger log_employee_reviews after insert or delete or update on public.employee_reviews
  for each row execute function log_change();

commit;

-- Check
select 'time off kinds' as what, string_agg(distinct kind, ', ') as detail from public.time_off_requests
union all select 'year reviews table', case when to_regclass('public.employee_reviews') is null then 'missing' else 'ready' end
union all select 'payroll function', case when to_regprocedure('public.payroll_data(date, date)') is null then 'missing' else 'ready' end;
