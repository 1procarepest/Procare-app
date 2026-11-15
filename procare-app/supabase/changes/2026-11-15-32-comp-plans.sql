-- 2026-11-15-32 comp plans: sales pay plans (shadow mode, nothing is sent to Everee).
-- comp_settings: every amount, rate, step, bonus level and hold in one editable row.
-- comp_service_groups: which FieldRoutes service types pay as pest, termite or mosquito.
-- comp_assignments: each rep's plan for a year (commission or flat), scale, and any special deal.
-- comp_sales(year, rep): the serviced sales the pay math needs. The math itself is in lib/comp.js.
-- Reps see only their own; sales managers, C-Suite and the President see everyone and edit plans.

begin;

create or replace function public.can_manage_pay()
returns boolean language sql stable security definer set search_path = public as $$
  select my_rank() >= 4 or (my_department() = 'sales' and my_rank() >= 3)
$$;
revoke all on function public.can_manage_pay() from public, anon;
grant execute on function public.can_manage_pay() to authenticated;

create table if not exists public.comp_settings (
  id             integer primary key default 1 check (id = 1),
  upfront        numeric not null default 100 check (upfront >= 0),
  hold_pct       numeric not null default 20 check (hold_pct between 0 and 100),
  past_due_days  integer not null default 60 check (past_due_days >= 0),
  clawback_days  integer not null default 365 check (clawback_days >= 0),
  flat_pest      numeric not null default 200 check (flat_pest >= 0),
  flat_termite   numeric not null default 150 check (flat_termite >= 0),
  flat_mosquito  numeric not null default 100 check (flat_mosquito >= 0),
  bonus          jsonb not null default '[{"min":600,"rate":60},{"min":780,"rate":65},{"min":1080,"rate":70}]',
  scales         jsonb not null default '{"first_year":{"name":"First year","start":25,"step":2,"every":50,"max":50},"experienced":{"name":"Experienced","start":30,"step":3,"every":50,"max":50}}',
  updated_by     uuid references public.employees(id) default public.my_id(),
  updated_at     timestamptz not null default now()
);
insert into public.comp_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.comp_service_groups (
  service_type text primary key,
  grp          text not null check (grp in ('pest', 'termite', 'mosquito'))
);
insert into public.comp_service_groups (service_type, grp) values
  ('General Pest Service', 'pest'),
  ('Termite Baiting System Service', 'termite'),
  ('Mosquito Service', 'mosquito'),
  ('Mosquito Green Treatment', 'mosquito'),
  ('Mosquito Service Hybrid', 'mosquito')
on conflict (service_type) do nothing;

create table if not exists public.comp_assignments (
  employee_id uuid not null references public.employees(id) on delete cascade,
  year        integer not null check (year between 2024 and 2100),
  plan        text not null check (plan in ('commission', 'flat')),
  scale       text not null default 'first_year',
  upfront     numeric check (upfront >= 0),        -- blank = the plan's up-front amount
  start_rate  numeric check (start_rate between 0 and 100),
  step_rate   numeric check (step_rate between 0 and 100),
  note        text,
  updated_by  uuid references public.employees(id) default public.my_id(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, year)
);

alter table public.comp_settings enable row level security;
alter table public.comp_service_groups enable row level security;
alter table public.comp_assignments enable row level security;

drop policy if exists comp_settings_read on public.comp_settings;
create policy comp_settings_read on public.comp_settings for select to authenticated using (my_id() is not null);
drop policy if exists comp_settings_write on public.comp_settings;
create policy comp_settings_write on public.comp_settings for update to authenticated using (can_manage_pay()) with check (can_manage_pay());

drop policy if exists comp_groups_read on public.comp_service_groups;
create policy comp_groups_read on public.comp_service_groups for select to authenticated using (my_id() is not null);
drop policy if exists comp_groups_write on public.comp_service_groups;
create policy comp_groups_write on public.comp_service_groups for all to authenticated using (can_manage_pay()) with check (can_manage_pay());

drop policy if exists comp_assignments_read on public.comp_assignments;
create policy comp_assignments_read on public.comp_assignments for select to authenticated using (employee_id = my_id() or can_manage_pay());
drop policy if exists comp_assignments_write on public.comp_assignments;
create policy comp_assignments_write on public.comp_assignments for all to authenticated using (can_manage_pay()) with check (can_manage_pay());

drop trigger if exists log_comp_settings on public.comp_settings;
create trigger log_comp_settings after insert or delete or update on public.comp_settings for each row execute function log_change();
drop trigger if exists log_comp_service_groups on public.comp_service_groups;
create trigger log_comp_service_groups after insert or delete or update on public.comp_service_groups for each row execute function log_change();
drop trigger if exists log_comp_assignments on public.comp_assignments;
create trigger log_comp_assignments after insert or delete or update on public.comp_assignments for each row execute function log_change();

-- Serviced sales (pest, termite, mosquito) whose first service was in p_year or the year before
-- (last year's are needed for clawbacks). A sale = one fr_subscriptions row; rep = sold_by.
-- served = date of the completed initial appointment; cv = yearly billing + initial price.
create or replace function public.comp_sales(p_year integer, p_emp uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  boss boolean := can_manage_pay();
  who uuid := case when can_manage_pay() then p_emp else my_id() end;
  lo date := make_date(p_year - 1, 1, 1);
  hi date := make_date(p_year, 12, 31);
  result jsonb;
begin
  if my_id() is null or p_year is null or p_year < 2024 or p_year > 2100 then return null; end if;

  with idmap as materialized (
    select distinct on (x.fr_id::bigint) x.fr_id::bigint as fr_id, e.id as emp
    from employees e cross join lateral unnest(tech_fr_ids(e.id)) as x(fr_id)
    where who is null or e.id = who
    order by x.fr_id::bigint, e.active desc
  ),
  sales as materialized (
    select m.emp, s.subscription_id as id, c.last_name as cust, g.grp,
           (s.date_added at time zone 'America/New_York')::date as sold,
           coalesce(ia.date, (s.date_added at time zone 'America/New_York')::date) as served,
           coalesce(s.annual_recurring_value, 0) + coalesce(s.initial_service_total, 0) as cv,
           coalesce(s.date_cancelled, case when not coalesce(s.active, true) then c.date_cancelled end) as cancelled,
           coalesce(c.balance, 0) as bal, coalesce(c.balance_age, 0) as age
    from fr_subscriptions s
    join comp_service_groups g on g.service_type = s.service_type
    join idmap m on m.fr_id = s.sold_by
    left join fr_appointments ia on ia.appointment_id = s.initial_appointment_id
    left join fr_customers c on c.customer_id = s.customer_id
    where s.initial_status_text = 'Completed'
      and s.date_added >= ((lo - 60)::timestamp at time zone 'America/New_York')
  ),
  picked as (select * from sales where served between lo and hi),
  people as (
    select e.id, trim(e.first_name || ' ' || e.last_name) as name, e.office, e.active, e.photo_url
    from employees e
    where (who is null or e.id = who)
      and ((e.department = 'sales' and e.active)
           or e.id in (select emp from picked)
           or e.id in (select employee_id from comp_assignments where year in (p_year - 1, p_year)))
  )
  select jsonb_build_object(
    'year', p_year,
    'boss', boss,
    'settings', (select to_jsonb(cs) - 'updated_by' from comp_settings cs where cs.id = 1),
    'groups', (select coalesce(jsonb_object_agg(service_type, grp), '{}') from comp_service_groups),
    'types', case when boss then (select coalesce(jsonb_agg(distinct service_type), '[]') from fr_subscriptions
                                 where service_type is not null and date_added >= (lo::timestamp at time zone 'America/New_York')) end,
    'reps', (select coalesce(jsonb_agg(p order by p.active desc, p.name), '[]') from people p),
    'plans', (select coalesce(jsonb_agg(a), '[]') from comp_assignments a
              where a.year in (p_year - 1, p_year) and (who is null or a.employee_id = who)),
    'sales', (select coalesce(jsonb_agg(jsonb_build_object('e', emp, 'id', id, 'c', cust, 'g', grp, 'sold', sold,
              'served', served, 'cv', cv, 'can', cancelled, 'bal', bal, 'age', age) order by served), '[]') from picked)
  ) into result;
  return result;
end $$;
revoke all on function public.comp_sales(integer, uuid) from public, anon;
grant execute on function public.comp_sales(integer, uuid) to authenticated;

commit;
