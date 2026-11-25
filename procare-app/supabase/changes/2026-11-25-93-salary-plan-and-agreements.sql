-- 93 (2026-11-25). Sales: a Salary plan, and sales agreements that write themselves from each rep's plan (John).
--  * Salary plan: a set weekly salary (processed Monday, paid Wednesday, like all pay) instead of up fronts. Quarter
--    bonuses = commission earned so far this year − salary paid − earlier bonuses; same hold and clawbacks.
--    comp_assignments.salary (per week) and salary_from (first week it's paid; blank = January 1).
--  * comp_assignments.agreement_terms: special terms for one rep, printed in their agreement's pay section.
--  * agreement_settings: the fill-ins every agreement uses (company, address, who signs for ProCare, pricing
--    guidelines, equipment). Changed on the agreement page by C-Suite and the President.
--  * sales_agreements: each signed agreement, saved word for word as it read when signed. When a rep's plan or the
--    agreement changes, the wording changes and they're asked to sign again; the old signed copy is kept.
--    Only the app's server writes here (it re-creates the wording itself, so what's saved is what was shown).
-- Safe to run twice.

begin;

-- Salary plan
alter table public.comp_assignments drop constraint if exists comp_assignments_plan_check;
alter table public.comp_assignments add constraint comp_assignments_plan_check check (plan in ('commission', 'flat', 'salary'));
alter table public.comp_assignments add column if not exists salary numeric check (salary >= 0);
alter table public.comp_assignments add column if not exists salary_from date;
alter table public.comp_assignments add column if not exists agreement_terms text;

-- Fill-ins for every agreement
create table if not exists public.agreement_settings (
  id            integer primary key default 1 check (id = 1),
  company       text not null default 'ProCare Sales, LLC',
  company_desc  text not null default 'a Georgia limited liability company',
  address       text not null default '3850 Canton Rd. Ste. 3118, Marietta, GA 30066',
  county        text not null default 'Cobb County, Georgia',
  signer_name   text not null default '',
  signer_title  text not null default 'President',
  schedule      text not null default 'Give your manager the days and hours you plan to work each week, and work that schedule.
Let your manager know when you start and stop working each day (drop a start and stop pin).
Tell your manager ahead of time when you''re taking a day off.
Attend the Monday 10 a.m. sales meeting.',
  pricing       text not null default 'General pest: initial service $150 (as low as $50, or $0 for a customer switching from another company); quarterly service $150 (as low as $120, or $105 for a customer switching).
Termite baiting system: installation $400 (as low as $200, or $0 for a customer switching); quarterly coverage $100 (as low as $85 for a customer switching).
Mosquito: initial service $90 (may be $0 to earn the customer''s business); monthly service $90 (as low as $65).
ProCare does not pay on accounts sold below these prices unless a manager approved the price match first.',
  equipment     text not null default 'Any equipment ProCare lends the Contractor (for example a Segway scooter, worth about $500, or signs, shirts and sales materials) is and stays ProCare''s property.',
  updated_by    uuid references public.employees(id) on delete set null default public.my_id(),
  updated_at    timestamptz not null default now()
);
insert into public.agreement_settings (id) values (1) on conflict (id) do nothing;
alter table public.agreement_settings enable row level security;
drop policy if exists agreement_settings_read on public.agreement_settings;
create policy agreement_settings_read on public.agreement_settings for select to authenticated using (my_id() is not null);
drop policy if exists agreement_settings_write on public.agreement_settings;
create policy agreement_settings_write on public.agreement_settings for update to authenticated using (my_rank() >= 4) with check (my_rank() >= 4);
drop trigger if exists log_agreement_settings on public.agreement_settings;
create trigger log_agreement_settings after insert or delete or update on public.agreement_settings for each row execute function log_change();

-- Signed agreements
create table if not exists public.sales_agreements (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.employees(id) on delete cascade,
  year                 integer not null,
  hash                 text not null,             -- fingerprint of the wording
  title                text not null,
  body                 jsonb not null,            -- the whole agreement as it read when signed
  signed_name          text not null,
  signed_at            timestamptz not null default now(),
  company_signed_by    uuid references public.employees(id) on delete set null,
  company_signed_name  text,
  company_signed_at    timestamptz,
  unique (employee_id, year, hash)
);
create index if not exists sales_agreements_emp on public.sales_agreements (employee_id, year);
alter table public.sales_agreements enable row level security;
revoke all on public.sales_agreements from anon, authenticated;
grant select on public.sales_agreements to authenticated;
drop policy if exists sales_agreements_read on public.sales_agreements;
create policy sales_agreements_read on public.sales_agreements for select to authenticated
  using (employee_id = my_id() or can_manage_pay() or can_manage_onboarding());
drop trigger if exists log_sales_agreements on public.sales_agreements;
create trigger log_sales_agreements after insert or delete or update on public.sales_agreements for each row execute function log_change();

-- Saved pay is kept per person's access; start fresh so the new columns show up
delete from public.rpc_cache where fn = 'comp_sales';

commit;

notify pgrst, 'reload schema';

-- Check
select 'salary plan allowed' as what, (select count(*) from information_schema.columns where table_name = 'comp_assignments' and column_name in ('salary', 'salary_from', 'agreement_terms'))::text as detail
union all select 'agreement settings', (select company from public.agreement_settings where id = 1)
union all select 'signed agreements table', (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'sales_agreements')::text;
