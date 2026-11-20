-- 65 (2026-11-19). Wildlife pay (Phase 2). Rules from John, 2026-11-19:
--  * Commission plan (default): 10% to whoever sold the job (FieldRoutes Sales Rep 1) and 25% to whoever did the
--    work (serviced the first visit). Both are earned the day the first visit is completed.
--  * What it's paid on: Exclusion and Insulation, the initial job only (initial service total: never the warranty
--    renewal or the recurring part). Trapping, the entire job (contract value). Wildlife Warranty: not paid.
--    Reservices: never paid.
--  * Salary plan instead: a salary per pay period plus a bonus for each job whose first visit they did.
--  * Referrals: whoever is Sales Rep 2 (a tech or sales rep) gets $100 (setting) when the first visit is done.
--  * Rates are set per person. Plans are changed by C-Suite, the President and the HR approver (Ally).
--    Each person sees their own pay; Jessica (wildlife_access), the HR approver, C-Suite and the President see all.
-- Safe to run twice.

begin;

create table if not exists public.wildlife_pay_plans (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  plan        text not null default 'commission' check (plan in ('commission', 'salary')),
  sell_pct    numeric not null default 10 check (sell_pct between 0 and 100),
  work_pct    numeric not null default 25 check (work_pct between 0 and 100),
  salary      numeric not null default 0 check (salary >= 0),       -- per pay period (salary plan)
  job_bonus   numeric not null default 0 check (job_bonus >= 0),    -- per job done (salary plan)
  updated_by  uuid references public.employees(id) on delete set null default public.my_id(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.wildlife_pay_settings (
  id              smallint primary key default 1 check (id = 1),
  referral_amount numeric not null default 100 check (referral_amount >= 0),
  updated_at      timestamptz not null default now()
);
insert into public.wildlife_pay_settings (id) values (1) on conflict (id) do nothing;

create or replace function public.can_manage_wildlife_pay()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_rank() >= 4, false) or is_hr_approver()
$$;
revoke all on function public.can_manage_wildlife_pay() from public, anon;
grant execute on function public.can_manage_wildlife_pay() to authenticated;

-- Sees everyone's wildlife pay: Jessica (wildlife_access), the HR approver, C-Suite and the President
create or replace function public.can_see_all_wildlife_pay()
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_wildlife_pay() or exists (select 1 from employees e where e.id = my_id() and e.wildlife_access)
$$;
revoke all on function public.can_see_all_wildlife_pay() from public, anon;
grant execute on function public.can_see_all_wildlife_pay() to authenticated;

alter table public.wildlife_pay_plans enable row level security;
drop policy if exists wl_plans_read on public.wildlife_pay_plans;
create policy wl_plans_read on public.wildlife_pay_plans for select to authenticated
  using (employee_id = my_id() or can_see_all_wildlife_pay());
drop policy if exists wl_plans_write on public.wildlife_pay_plans;
create policy wl_plans_write on public.wildlife_pay_plans for all to authenticated
  using (can_manage_wildlife_pay()) with check (can_manage_wildlife_pay());
grant select, insert, update, delete on public.wildlife_pay_plans to authenticated;

alter table public.wildlife_pay_settings enable row level security;
drop policy if exists wl_settings_read on public.wildlife_pay_settings;
create policy wl_settings_read on public.wildlife_pay_settings for select to authenticated using (true);
drop policy if exists wl_settings_write on public.wildlife_pay_settings;
create policy wl_settings_write on public.wildlife_pay_settings for update to authenticated
  using (can_manage_wildlife_pay()) with check (can_manage_wildlife_pay());
grant select, update on public.wildlife_pay_settings to authenticated;

drop trigger if exists log_wildlife_pay_plans on public.wildlife_pay_plans;
create trigger log_wildlife_pay_plans after insert or delete or update on public.wildlife_pay_plans
  for each row execute function log_change();

-- Wildlife jobs whose first visit was completed between the dates, with who sold, did and referred each
create or replace function public.wildlife_pay_data(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := my_id();
  everyone boolean := can_see_all_wildlife_pay();
  result jsonb;
begin
  if me is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then return null; end if;
  if not everyone and not exists (select 1 from employees where id = me and department::text = 'wildlife') then return null; end if;
  with idmap as materialized (   -- FieldRoutes ID -> app person (every active person, for referrals too)
    select e.id as emp, x.fr_id from employees e cross join lateral unnest(tech_fr_ids(e.id)) as x(fr_id) where e.active
  ),
  team as (select e.id, e.first_name, e.last_name from employees e
           where e.active and e.department::text = 'wildlife' and (everyone or e.id = me)),
  jobs as (
    select s.subscription_id as id, s.service_type, wildlife_line(s.service_type) as line,
           c.first_name as first, coalesce(c.last_name, c.company_name) as cust,
           a.date as done_on,
           case when wildlife_line(s.service_type) = 'trapping' then coalesce(nullif(s.contract_value, 0), s.initial_service_total)
                else s.initial_service_total end as basis,
           (select m.emp from idmap m where m.fr_id = s.sold_by limit 1) as seller,
           (select m.emp from idmap m where m.fr_id = coalesce(nullif(a.serviced_by, 0), nullif(a.employee_id, 0)) limit 1) as worker,
           (select m.emp from idmap m where m.fr_id = nullif(s.sold_by_2, 0) limit 1) as referrer
    from fr_subscriptions s
    join fr_appointments a on a.appointment_id = s.initial_appointment_id and a.status = 1 and a.date between p_from and p_to
    left join fr_customers c on c.customer_id = s.customer_id
    where wildlife_line(s.service_type) in ('exclusion', 'insulation', 'trapping')
  )
  select jsonb_build_object(
    'team', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.first_name || ' ' || t.last_name) order by t.first_name), '[]') from team t),
    'plans', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from wildlife_pay_plans p where p.employee_id in (select id from team)),
    'referral_amount', (select referral_amount from wildlife_pay_settings where id = 1),
    'jobs', (select coalesce(jsonb_agg(to_jsonb(j) order by j.done_on, j.id), '[]') from jobs j
             where j.seller in (select id from team) or j.worker in (select id from team) or (everyone and j.referrer is not null)),
    'people', (select coalesce(jsonb_object_agg(e.id, e.first_name || ' ' || e.last_name), '{}') from employees e
               where e.id in (select seller from jobs union select worker from jobs union select referrer from jobs)),
    'can_edit', can_manage_wildlife_pay(),
    'everyone', everyone
  ) into result;
  return result;
end $$;
revoke all on function public.wildlife_pay_data(date, date) from public, anon;
grant execute on function public.wildlife_pay_data(date, date) to authenticated;

commit;

-- Check: the pay settings and how many wildlife jobs had their first visit done this month
select 'referral amount' as what, referral_amount::text as detail from public.wildlife_pay_settings
union all
select 'wildlife jobs, first visit done this month', count(*)::text
from public.fr_subscriptions s join public.fr_appointments a on a.appointment_id = s.initial_appointment_id and a.status = 1
where public.wildlife_line(s.service_type) in ('exclusion', 'insulation', 'trapping')
  and a.date >= date_trunc('month', (now() at time zone 'America/New_York'))::date;
