-- 2026-11-20. Clear everyone's Earnings (cash payout) to $0 before payouts go live in the app (John: reps are paid
-- outside the app for now, so balances shown today aren't real). Safe to run again later, e.g. right before launch.
--  * Waiting cash-out requests are marked paid, with a note.
--  * Each person's unpaid prizes and approved bonuses are grouped into one payout marked paid, with a note.
--  * Nothing is deleted and nobody is emailed. The note makes these easy to find: "Cleared before launch".
-- The result shows each person whose balance was cleared and how much.

begin;

drop table if exists cleared;
create temp table cleared (who text, what text, amount numeric);

-- 1. Waiting cash-out requests -> paid outside the app
with r as (
  update public.payout_requests p
  set status = 'paid', paid_at = now(), note = 'Cleared before launch: paid outside the app'
  where p.status = 'requested'
  returning p.employee_id, p.amount
)
insert into cleared select e.first_name || ' ' || e.last_name, 'waiting cash-out request', r.amount
from r join public.employees e on e.id = r.employee_id;

-- 2. Unpaid prizes and bonuses -> one paid payout per person
with owed as (
  select employee_id, sum(amount) as amount from public.competition_awards where payout_id is null group by employee_id
),
p as (
  insert into public.payout_requests (employee_id, amount, status, requested_at, paid_at, note)
  select employee_id, amount, 'paid', now(), now(), 'Cleared before launch: paid outside the app' from owed where amount > 0
  returning id, employee_id, amount
),
linked as (
  update public.competition_awards a set payout_id = p.id
  from p where a.employee_id = p.employee_id and a.payout_id is null
  returning a.id
)
insert into cleared select e.first_name || ' ' || e.last_name, 'unpaid prizes and bonuses', p.amount
from p join public.employees e on e.id = p.employee_id;

commit;

-- Result (Supabase shows this last part)
select who, what, amount from cleared
union all
select 'Total cleared', count(*)::text || ' item(s)', coalesce(sum(amount), 0) from cleared
order by 1;
