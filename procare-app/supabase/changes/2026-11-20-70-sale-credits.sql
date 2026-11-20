-- 70 (2026-11-20). Sales pay into Earnings (John, 2026-11-20). When a sale's first service is completed:
--  * Technicians: $100 for each sale they're Sales Rep 1 on (while the Sales incentive is on in Incentive settings).
--  * Office team: $100 for each sale they're Sales Rep 1 on whose lead source is "Office upsell" (they brought up the
--    added service; the customer didn't call in for it).
--  * Wildlife referrals: whoever is Sales Rep 2 on a wildlife job (Exclusion, Insulation, Trapping) gets $100
--    (Wildlife pay setting), unless they're also Sales Rep 1 or on the Wildlife team (who are paid commission).
--  Counted for first services completed on or after pay_settings.sale_credit_start (Nov 16, 2026: earlier ones were
--  paid outside the app). Door-to-door reps keep their weekly pay in the Sales app; nothing here pays them for
--  their own sales. Added every 30 minutes by a scheduled job; each sale is credited once.
--  * Cash out needs at least $100 waiting (pay_settings.cashout_min), so HR doesn't process many small payments.
-- Safe to run twice.

begin;

create table if not exists public.pay_settings (
  id                smallint primary key default 1 check (id = 1),
  sale_credit_start date not null default date '2026-11-16',
  tech_sale_amt     numeric not null default 100 check (tech_sale_amt >= 0),
  office_upsell_amt numeric not null default 100 check (office_upsell_amt >= 0),
  cashout_min       numeric not null default 100 check (cashout_min >= 0),
  updated_at        timestamptz not null default now()
);
insert into public.pay_settings (id) values (1) on conflict (id) do nothing;
alter table public.pay_settings enable row level security;
drop policy if exists pay_settings_read on public.pay_settings;
create policy pay_settings_read on public.pay_settings for select to authenticated using (true);
drop policy if exists pay_settings_write on public.pay_settings;
create policy pay_settings_write on public.pay_settings for update to authenticated using (my_rank() >= 4) with check (my_rank() >= 4);
grant select, update on public.pay_settings to authenticated;

create index if not exists competition_awards_key on public.competition_awards (employee_id, award_key);

-- Adds the sale credits that are due and not yet in Earnings. Returns how many were added.
create or replace function public.sync_sale_credits()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  st public.pay_settings;
  ref_amt numeric := coalesce((select referral_amount from wildlife_pay_settings where id = 1), 100);
  sales_on boolean := coalesce((select rules ->> 'on_sales' from scorecard_rules where id = 1), 'true') <> 'false';
  n integer;
begin
  select * into st from pay_settings where id = 1;
  if st is null then return 0; end if;
  with idmap as materialized (
    select e.id as emp, e.department::text as dept, x.fr_id
    from employees e cross join lateral unnest(tech_fr_ids(e.id)) as x(fr_id) where e.active
  ),
  done as materialized (   -- sales whose first service was completed since the start date
    select s.subscription_id, s.service_type, s.source, s.sold_by, s.sold_by_2, a.date as served,
           coalesce(c.last_name, c.company_name, 'customer') as cust
    from fr_subscriptions s
    join fr_appointments a on a.appointment_id = s.initial_appointment_id and a.status = 1 and a.date >= st.sale_credit_start
    left join fr_customers c on c.customer_id = s.customer_id
  ),
  credits as (
    -- Technicians: their own sales
    select m.emp, 'sale:' || d.subscription_id as k, st.tech_sale_amt as amt,
           'Tech sale ' || chr(183) || ' ' || d.cust || ' (' || coalesce(d.service_type, 'service') || '), serviced ' || to_char(d.served, 'Mon FMDD') as reason
    from done d join idmap m on m.fr_id = d.sold_by and m.dept = 'technician'
    where sales_on and st.tech_sale_amt > 0
    union all
    -- Office team: Office upsell sales
    select m.emp, 'upsell:' || d.subscription_id, st.office_upsell_amt,
           'Office upsell ' || chr(183) || ' ' || d.cust || ' (' || coalesce(d.service_type, 'service') || '), serviced ' || to_char(d.served, 'Mon FMDD')
    from done d join idmap m on m.fr_id = d.sold_by and m.dept = 'administrative'
    where d.source ~* 'office\s*up-?\s*sell' and st.office_upsell_amt > 0
    union all
    -- Wildlife referrals: Sales Rep 2 on a wildlife job (not the seller, not on the Wildlife team)
    select m.emp, 'wl-referral:' || d.subscription_id, ref_amt,
           'Wildlife referral ' || chr(183) || ' ' || d.cust || ' (' || coalesce(d.service_type, 'wildlife') || '), serviced ' || to_char(d.served, 'Mon FMDD')
    from done d join idmap m on m.fr_id = nullif(d.sold_by_2, 0) and m.dept <> 'wildlife'
    where wildlife_line(d.service_type) in ('exclusion', 'insulation', 'trapping') and ref_amt > 0
      and not exists (select 1 from idmap s1 where s1.fr_id = d.sold_by and s1.emp = m.emp)
  ),
  one as (select distinct on (emp, k) emp, k, amt, reason from credits order by emp, k)
  insert into competition_awards (competition_id, employee_id, award_key, amount, reason)
  select null, o.emp, o.k, o.amt, o.reason from one o
  where not exists (select 1 from competition_awards x where x.employee_id = o.emp and x.award_key = o.k);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.sync_sale_credits() from public, anon, authenticated;

-- Cash out: at least the minimum waiting
create or replace function public.request_payout()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_id();
  total numeric;
  minimum numeric := coalesce((select cashout_min from pay_settings where id = 1), 100);
  rid uuid;
begin
  if me is null then return null; end if;
  select coalesce(sum(amount), 0) into total from competition_awards where employee_id = me and payout_id is null;
  if total <= 0 then return null; end if;
  if total < minimum then raise exception 'You can cash out once you have at least $% waiting.', round(minimum); end if;
  insert into payout_requests (employee_id, amount) values (me, total) returning id into rid;
  update competition_awards set payout_id = rid where employee_id = me and payout_id is null;
  return rid;
end $$;
revoke all on function public.request_payout() from public, anon;
grant execute on function public.request_payout() to authenticated;

commit;

-- Every 30 minutes (replaces the job if it already exists)
select cron.schedule('procare-sale-credits', '*/30 * * * *', 'select public.sync_sale_credits()');

-- Add what's due now
select public.sync_sale_credits();

-- Check (Supabase shows this last part): the lead sources counted as office upsells, and the credits by kind
select 'lead source counted as office upsell' as what, string_agg(distinct source, ', ') as detail from public.fr_subscriptions where source ~* 'office\s*up-?\s*sell'
union all
select 'credit start date', sale_credit_start::text from public.pay_settings where id = 1
union all
select 'credits so far: ' || split_part(award_key, ':', 1), count(*) || ' totaling $' || sum(amount)
from public.competition_awards where award_key ~ '^(sale|upsell|wl-referral):' group by split_part(award_key, ':', 1);
