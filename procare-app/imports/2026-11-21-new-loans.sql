-- 2026-11-21. From John's documents (no account, routing or loan numbers copied). Safe to run twice.
--  * Truck 796: Gwinnett Place Ford buyer's order 10/26/2026 (2027 Ford Transit, Agate Black) and the Ford Credit
--    contract dated 10/28/2026: $59,000 financed at 8.34%, 60 payments of $1,210.12 starting 12/12/2026, $500 down.
--  * Truck 933: Ford Credit contract dated 6/1/2026: $52,412.68 financed at 7.69%, 60 payments of $1,058.36 starting
--    7/16/2026, $5,000 down. (The debt sheet had $1,108.36 a month on $52,909.59; the contract's numbers add up.)
--  * LEAF Capital Funding (CapitalNOW) business funding: $200,000 + $2,000 structuring fee = $202,000, 30 monthly
--    payments of $8,212.76 (about 16% a year). First payment date isn't on page 1: add it in Finance → Debt.

begin;

-- 796
update public.trucks set
  year = 2027, bought_on = coalesce(bought_on, '2026-10-26'), purchase_price = 54071.56,
  mileage = coalesce(mileage, 10), mileage_on = coalesce(mileage_on, '2026-10-26'),
  notes = case when coalesce(notes, '') like '%Gwinnett Place Ford%' then notes
               else concat_ws(' ', notes, 'Bought new 10/26/2026 from Gwinnett Place Ford: $54,071.56 cash price ($55,050 less $4,773.44 discount, plus $3,795 wrap), $59,000 with tax and fees. Agate Black.') end,
  updated_at = now()
where vin = '1FTBR1Y8XVKA27796';

insert into public.truck_loans (truck_id, lender, payment, start_on, end_on, financed, rate, balance, balance_on, paid_off, notes)
select t.id, 'Ford Credit', 1210.12, '2026-10-28', '2031-11-12', 59000, 8.34, 59000, '2026-10-28', false,
       '60 payments of $1,210.12 starting 12/12/2026. $500 down. Total of payments $72,607.20.'
from public.trucks t
where t.vin = '1FTBR1Y8XVKA27796' and not exists (select 1 from public.truck_loans l where l.truck_id = t.id);

-- 933
update public.truck_loans l set
  lender = 'Ford Credit', payment = 1058.36, financed = 52412.68, start_on = '2026-06-01', end_on = '2031-06-16', rate = 7.69,
  notes = '60 payments of $1,058.36 starting 7/16/2026. $5,000 down. Payment and amount financed from the contract (the debt sheet had $1,108.36 / $52,909.59).',
  updated_at = now()
from public.trucks t
where l.truck_id = t.id and t.vin = '1FTBR1Y82SKB26933';

-- LEAF Capital
insert into public.debts (name, kind, lender, payment, rate, rate_note, original, purpose, sort)
select 'LEAF Capital (CapitalNOW)', 'short', 'LEAF Capital Funding', 8212.76, 15.99,
       '30 payments of $8,212.76 (about 16% a year)', 202000,
       '$200,000 business funding plus a $2,000 structuring fee (total $202,000). 30 monthly payments, $246,382.80 in all. Can only be paid off in full, at a 3% discount on the payments left.', 2
where not exists (select 1 from public.debts where name = 'LEAF Capital (CapitalNOW)');

commit;

-- Check
select 'truck 796' as what, concat_ws(' · ', t.year || ' ' || t.make || ' ' || t.model, '$' || t.purchase_price, l.lender || ' $' || l.payment || '/mo to ' || l.end_on) as detail
from public.trucks t left join public.truck_loans l on l.truck_id = t.id where t.vin = '1FTBR1Y8XVKA27796'
union all
select 'truck 933', l.lender || ' $' || l.payment || '/mo, ' || l.rate || '%' from public.truck_loans l join public.trucks t on t.id = l.truck_id where t.vin = '1FTBR1Y82SKB26933'
union all
select 'LEAF Capital', '$' || payment || '/mo, ' || coalesce(start_on::text, 'start date not set yet') from public.debts where name = 'LEAF Capital (CapitalNOW)';
