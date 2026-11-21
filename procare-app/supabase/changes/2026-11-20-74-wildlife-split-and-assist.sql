-- 74 (2026-11-20). Wildlife pay: split jobs and the office assist (John, 2026-11-20).
--  * Split (a switch per job, on by default): Bryan and Sam usually go to a job together, so the whole commission on it
--    (the selling % and the doing-the-work %) is shared evenly by the wildlife team members on the commission plan.
--    Switched off, it goes back to the change 65 rule: seller gets the selling %, whoever did the first visit the work %.
--  * Office assist (a switch per job, off by default): Jessica gets $100 (setting) for each wildlife sale she helps
--    close. It comes OUT of the wildlife team's pay, not on top: split jobs take half from each, other jobs from the
--    seller (or whoever did the work if the seller isn't on the team). It shows on the pay report only: nothing goes
--    to Earnings / cash out. Who gets it is a switch on the person's profile (employees.wildlife_assist), so it can move
--    to someone else later. Jessica is switched on here.
--  * The job switches are set by C-Suite, the President, the HR approver and Jessica (wildlife_access).
-- Safe to run twice.

begin;

alter table public.employees add column if not exists wildlife_assist boolean not null default false;
alter table public.wildlife_pay_settings add column if not exists assist_amount numeric not null default 100 check (assist_amount >= 0);

create table if not exists public.wildlife_job_pay (
  subscription_id bigint primary key,
  split           boolean not null default true,
  assist          boolean not null default false,
  updated_by      uuid references public.employees(id) on delete set null default public.my_id(),
  updated_at      timestamptz not null default now()
);
alter table public.wildlife_job_pay enable row level security;   -- read and written only through the functions below
revoke all on public.wildlife_job_pay from anon, authenticated;
drop trigger if exists log_wildlife_job_pay on public.wildlife_job_pay;
create trigger log_wildlife_job_pay after insert or delete or update on public.wildlife_job_pay
  for each row execute function log_change();

-- Who flips the per-job switches: whoever manages wildlife pay, and Jessica (wildlife_access)
create or replace function public.can_set_wildlife_jobs()
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_wildlife_pay() or exists (select 1 from employees e where e.id = my_id() and e.active and e.wildlife_access)
$$;
revoke all on function public.can_set_wildlife_jobs() from public, anon;
grant execute on function public.can_set_wildlife_jobs() to authenticated;

create or replace function public.set_wildlife_job(p_subscription bigint, p_split boolean, p_assist boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_set_wildlife_jobs() then raise exception 'Only C-Suite, HR and the wildlife office can change this.'; end if;
  insert into wildlife_job_pay (subscription_id, split, assist) values (p_subscription, coalesce(p_split, true), coalesce(p_assist, false))
  on conflict (subscription_id) do update set split = excluded.split, assist = excluded.assist, updated_by = my_id(), updated_at = now();
end $$;
revoke all on function public.set_wildlife_job(bigint, boolean, boolean) from public, anon;
grant execute on function public.set_wildlife_job(bigint, boolean, boolean) to authenticated;

-- The profile switch: who gets the office assist
create or replace function public.set_wildlife_assist(p_employee uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_wildlife_pay() then raise exception 'Only C-Suite, the President and HR can change this.'; end if;
  update employees set wildlife_assist = coalesce(p_on, false), updated_at = now() where id = p_employee;
end $$;
revoke all on function public.set_wildlife_assist(uuid, boolean) from public, anon;
grant execute on function public.set_wildlife_assist(uuid, boolean) to authenticated;

update public.employees set wildlife_assist = true, updated_at = now()
where active and lower(trim(first_name)) in ('jessica', 'jess') and lower(trim(last_name)) = 'bowles' and not wildlife_assist;

-- Wildlife pay (change 65) plus each job's split / assist switches, the whole wildlife team (for splitting) and who
-- gets the office assist. A team member sees every job the team earned on (a split job pays them even when the
-- other person sold it and did the work).
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
  crew as (select e.id, e.first_name, e.last_name from employees e where e.active and e.department::text = 'wildlife'),
  team as (select c.* from crew c where everyone or c.id = me),
  jobs as (
    select s.subscription_id as id, s.service_type, wildlife_line(s.service_type) as line,
           c.first_name as first, coalesce(c.last_name, c.company_name) as cust,
           a.date as done_on,
           case when wildlife_line(s.service_type) = 'trapping' then coalesce(nullif(s.contract_value, 0), s.initial_service_total)
                else s.initial_service_total end as basis,
           (select m.emp from idmap m where m.fr_id = s.sold_by limit 1) as seller,
           (select m.emp from idmap m where m.fr_id = coalesce(nullif(a.serviced_by, 0), nullif(a.employee_id, 0)) limit 1) as worker,
           (select m.emp from idmap m where m.fr_id = nullif(s.sold_by_2, 0) limit 1) as referrer,
           coalesce(w.split, true) as split, coalesce(w.assist, false) as assist
    from fr_subscriptions s
    join fr_appointments a on a.appointment_id = s.initial_appointment_id and a.status = 1 and a.date between p_from and p_to
    left join fr_customers c on c.customer_id = s.customer_id
    left join wildlife_job_pay w on w.subscription_id = s.subscription_id
    where wildlife_line(s.service_type) in ('exclusion', 'insulation', 'trapping')
  )
  select jsonb_build_object(
    'team', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.first_name || ' ' || t.last_name) order by t.first_name), '[]') from team t),
    'crew', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.first_name || ' ' || c.last_name) order by c.first_name), '[]') from crew c),
    'plans', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from wildlife_pay_plans p where p.employee_id in (select id from crew)),
    'referral_amount', (select referral_amount from wildlife_pay_settings where id = 1),
    'assist_amount', (select assist_amount from wildlife_pay_settings where id = 1),
    'assistants', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name) order by e.first_name), '[]')
                   from employees e where e.active and e.wildlife_assist),
    'jobs', (select coalesce(jsonb_agg(to_jsonb(j) order by j.done_on, j.id), '[]') from jobs j
             where j.seller in (select id from crew) or j.worker in (select id from crew) or (everyone and j.referrer is not null)),
    'people', (select coalesce(jsonb_object_agg(e.id, e.first_name || ' ' || e.last_name), '{}') from employees e
               where e.id in (select seller from jobs union select worker from jobs union select referrer from jobs)),
    'can_edit', can_manage_wildlife_pay(),
    'can_toggle', can_set_wildlife_jobs(),
    'everyone', everyone
  ) into result;
  return result;
end $$;
revoke all on function public.wildlife_pay_data(date, date) from public, anon;
grant execute on function public.wildlife_pay_data(date, date) to authenticated;

commit;

-- Check
select 'office assist goes to' as what, coalesce(string_agg(first_name || ' ' || last_name, ', '), '(nobody yet)') as detail
from public.employees where active and wildlife_assist
union all
select 'office assist amount', '$' || assist_amount from public.wildlife_pay_settings where id = 1;
