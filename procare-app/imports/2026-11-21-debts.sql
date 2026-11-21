-- 2026-11-21. The debt schedule from John's photos: every truck loan, the SBA loan, and the credit cards / lines.
-- Run AFTER change 76. Safe to run twice.
--  * Truck loans: matched to the truck by VIN, or by truck # when the VIN on the two sheets differs (122, 124).
--    Trucks that already have a loan on file (the for-sale trucks, all paid off) are left alone.
--  * Balances here are from John's sheet (last updated around July 2026, when the SBA loan closed). Once a loan is
--    linked to its QuickBooks account in Finance → Debt, the QuickBooks balance is used instead.
--  * Purchase price, value and mileage (Oct 1, 2026) go on the truck. Mileage never overwrites a newer reading.
--  * No loan numbers. Credit cards keep the last digits John uses to tell them apart.

begin;

drop table if exists d_in;
drop table if exists d_match;
create temporary table d_in (
  truck_no text, vin text, lender text, payment numeric, start_on date, end_on date, price numeric, financed numeric,
  balance numeric, rate numeric, miles int, value numeric, note text
);

insert into d_in values
-- First block
('122','3TYRX5GN6PT072284','Ally',               512.92,'2023-02-20','2028-02-19', 33358, 28357.76, 15746.62, 8.99,  50066, 23000, null),
('124','3TYRX5GN6PT076724','Ally',               501.11,'2023-04-04','2028-04-02', 37171, 27170.98, 15602.64, 9.69,  70243, 22130, null),
('129','7G2CEHED8RA015590','Tesla',             1805.02,'2024-06-25','2030-06-25',102235,102235.00, 76154.32, 8.25,  52449, 72620, null),
('130','1N6ED1CL9RN668849','Nissan Finance (P)', 621.90,'2024-07-02','2029-07-12', 33797, 33796.62, 23778.54, 3.90,  49463, 20760, null),
('273','1N6ED1CL3RN670273','Nissan Finance (P)', 621.90,'2024-07-28','2029-08-12', 33797, 33796.62, 13521.61, 3.90,  32416, 21840, 'Loan sheet calls this truck 131'),
('210','3TYRX5GN5PT076195','Ally',               493.38,'2023-03-11','2028-03-09', 37278, 27277.58, 15521.69, 8.99,  56698, 22610, null),
('215','3TYKD5HNXRT001424','Ally',               643.79,'2024-04-26','2030-04-25', 38000, 33000.00, 24153.13, 11.74, 46655, 27510, null),
('218','3TYKD5HN3RT000731','Toyota',             668.45,'2024-03-29','2030-03-29', 37700, 37700.00, 28577.40, null,  53423, 28200, 'No interest rate on the sheet'),
('219','1N6ED1CL7RN611744','Nissan Finance (P)', 620.45,'2024-07-26','2030-07-26', 36390, 36390.45, 28858.33, 6.90,  36329, 21573, null),
('599','1N6ED1CL9SN625599','Nissan Finance (P)', 585.00,'2025-04-21','2031-04-20', 33567, 33566.63, 28839.58, 7.67,  22139, 24280, null),
('084','1N6ED1CL0SN610084','Ally',               611.50,'2025-05-10','2031-05-09', 33386, 33385.72, 29146.03, 9.44,  24971, 24280, null),
('639','1N6ED1CM9RN655639','Nissan Finance (P)', 699.24,'2025-08-09','2031-08-08', 33735, 33735.38, 31760.40, 8.78,  20051, 28000, null),
('445','1N6ED1CM1RN656445','Nissan Finance (P)', 699.24,'2025-08-10','2031-08-09', 33735, 33735.38, 31760.40, 8.78,  19805, 27820, null),
('002','3TYJDAHN3ST023002','Ally',               682.22,'2025-04-03','2031-04-02', 36182, 36182.10, 31968.00, 10.49, 32997, 26860, null),
('746','1N6ED1CL1SN659746','Ally',               543.77,'2025-09-29','2031-09-28', 34550, 34550.00, 31667.97, 7.79,  20383, 24990, null),
-- Second block (the for-sale trucks 117, 118, 120, 207, 208, 211, 123 are already on file as paid off)
('125','3TYRX5GN2PT078793','Toyota Financial',   673.88,'2023-05-04','2028-05-02', 32346, 32345.80, 10891.91, 0.00,  65259, 22110, null),
('212','3TYRX5GN1PT076744','Ally',               501.11,'2023-04-04','2028-04-02', 32171, 27170.98, 15602.64, 9.69,  64583, 22250, null),
('213','3TYRX5GN0PT076430','Ally',               572.74,'2023-05-01','2028-04-29', 32171, 27170.98, 12813.42, 9.49,  76758, 21170, null),
('214','3TYKD5HN3RT000762','Ally',               630.00,'2024-04-02','2030-04-02', 38078, 33078.39, 24403.28, 10.89, 28045, 30970, null),
('216','7G2CEHED1RA008335','Chase',             1630.42,'2024-06-24','2030-06-24',102235, 96760.80, 61807.60, 6.49,  54429, 73180, null),
('217','1N6ED1CL4RN655443','Nissan Finance (P)', 630.21,'2024-07-27','2030-07-26', 36390, 36390.45, 28651.84, 6.90,  29917, 21983, null),
('220','1N6ED1CL0RN654273','Nissan Finance (P)', 621.90,'2024-07-10','2030-07-10', 33797, 33796.62, 23347.12, 3.90,  58043, 20500, null),
('221','1N6ED1CL6RN654732','Nissan Finance (C)', 621.90,'2024-07-10','2030-07-10', 33797, 33796.62, 23347.12, 3.90,  38820, 21100, null),
('373','1N6ED1CLXRN675373','Nissan Finance (P)', 583.17,'2025-04-14','2031-04-13', 33386, 27487.37, 25013.44, 7.75,  31864, 22723, null),
('685','1N6ED1CL4SN610685','Nissan Finance',     412.16,'2025-07-05','2031-07-04', 32519, 23878.74, 21392.45, 7.33,  42637, 23580, null),
('388','1N6ED1CL8SN623388','Ally',               600.62,'2025-07-05','2031-07-04', 32519, 32519.04, 29647.37, 9.74,   6913, 24220, null),
('706','1N6ED1CL6RN674706','Nissan Finance (P)', 592.05,'2025-04-14','2031-04-14', 33894, 33735.38, 29740.77, 7.75,  24312, 22933, null),
('979','1N6ED1CM6RN654979','Nissan Finance (P)', 699.24,'2025-08-09','2031-08-08', 33735, 33735.38, 32211.74, 8.78,  20620, 27520, null),
-- 2026 trucks
('693','1N6ED1CL0TN601693','Nissan Finance (P)', 659.54,'2026-05-07','2032-05-22', 37502, 37502.42, 37502.42, 7.99,   6320, null, null),
('462','1N6ED1CL2TN658462','Nissan Finance (P)', 723.27,'2026-06-08','2032-06-06', 36553, 36552.94, 36067.94, 6.85,   null, null, null),
('492','1N6ED1CL9TN673492','Nissan Finance (P)', 650.97,'2026-08-13','2032-08-11', 37015, 37015.00, 37015.00, 7.99,   1745, null, null),
('30', '1N6ED1CL9TN652030','Nissan Finance (P)', 648.64,'2026-08-01','2032-07-30', 36924, 36924.00, 36924.00, 7.95,   3187, null, null),
('183','1N6ED1CL7TN673183','Nissan Finance (P)', 651.16,'2026-09-10','2032-09-08', 37015, 37015.20, 37015.20, 8.00,   null, null, null),
('943','1N6ED1CLXTN663943','Nissan Finance (P)', 727.31,'2026-08-30','2031-08-29', 36553, 36552.94, 36552.94, 7.08,   2297, null, null),
('16', '1N6ED1CL0TN649016','Nissan Finance (P)', 595.71,'2026-06-06','2032-06-04', 33921, 33921.13, 33921.13, 7.94,   null, null, null),
('159','1N6ED1CL3TN632159','Nissan Finance (P)', 653.74,'2026-06-08','2032-06-06', 37173, 37172.86, 37172.86, 7.99,   7824, null, null),
('394','1N6ED1CL7TN655394','Nissan Finance (P)', 688.64,'2026-08-08','2032-08-06', 38189, 38188.72, 38188.72, 8.88,   null, null, null),
('805','1N6ED1CL4TN673805','Nissan Finance (P)', 634.76,'2026-10-08','2032-10-06', 35900, 35900.00, 35900.00, 8.18,   null, null, null),
('300','1N6ED1CL8TN671300','Nissan Finance (P)', 727.31,'2026-09-28','2031-09-27', 36553, 36552.94, 36552.94, 7.08,   2129, null, null),
('933','1FTBR1Y82SKB26933','Ford Finance',      1108.36,'2026-06-01','2031-06-16', 52910, 52909.59, 51652.23, 7.69,   null, null, null),
('483','1N6ED1CL8TN673483','Nissan Finance (P)', 670.61,'2026-08-13','2032-08-25', 36940, 36940.30, 36940.30, 9.12,   null, null, null);

-- John 2026-11-21: fixes before the loans go on
-- * 122 and 124: the loan sheet's VINs pass the VIN check digit; the fleet sheet's don't (typo in the 9th character)
update public.trucks set vin = '3TYRX5GN6PT072284', updated_at = now() where vin = '3TYRX5GN5PT072284'
  and not exists (select 1 from public.trucks where vin = '3TYRX5GN6PT072284');
update public.trucks set vin = '3TYRX5GN6PT076724', updated_at = now() where vin = '3TYRX5GN7PT076724'
  and not exists (select 1 from public.trucks where vin = '3TYRX5GN6PT076724');
-- * The 2019 Tacoma (#14 on the loan sheet, 347 by the new last-3-of-the-VIN numbering): company-owned, paid off,
--   insured by the company, loaned to Dylan Barron (sales rep) for now
insert into public.trucks (truck_no, vin, year, make, model, office, driver_note, status, purchase_price, value, value_on, mileage, mileage_on, notes)
select '347', '5TFRX5GN8KX138347', 2019, 'Toyota', 'Tacoma',
       (select e.office from public.employees e where e.active and lower(e.first_name) = 'dylan' and lower(e.last_name) = 'barron' limit 1),
       'Dylan Barron', 'active', null, 15660, '2026-10-01', 107462, '2026-10-01',
       'Paid off. Was #14 on the loan sheet. Loaned to Dylan Barron (sales rep) for now; not a technician truck.'
where not exists (select 1 from public.trucks where vin = '5TFRX5GN8KX138347');
update public.trucks t set driver_id = e.id, driver_note = null
from public.employees e
where t.vin = '5TFRX5GN8KX138347' and t.driver_id is null and e.active and lower(e.first_name) = 'dylan' and lower(e.last_name) = 'barron';
-- * 796, the Transit John just bought: an "added" entry in its history, so the insurance + bookkeeper email can be
--   sent from the truck once the purchase agreement is entered (Email insurance & bookkeeper button)
insert into public.truck_log (truck_id, kind, text)
select t.id, 'added', 'Added to the fleet (new purchase)' from public.trucks t
where t.vin = '1FTBR1Y8XVKA27796' and not exists (select 1 from public.truck_log g where g.truck_id = t.id and g.kind = 'added');

-- Which truck each row is: VIN first, then truck # (on the sheet)
create temporary table d_match as
select d.*, coalesce(
  (select t.id from public.trucks t where t.vin = d.vin),
  (select t.id from public.trucks t where t.truck_no = d.truck_no and t.status in ('active', 'for_sale') order by t.created_at limit 1)
) as truck_id
from d_in d;

insert into public.truck_loans (truck_id, lender, payment, start_on, end_on, financed, rate, balance, balance_on, paid_off, notes)
select m.truck_id, m.lender, m.payment, m.start_on, m.end_on, m.financed, m.rate, m.balance, null, false,
       concat_ws('. ', 'Balance from the debt sheet (about July 2026)', m.note)
from d_match m
where m.truck_id is not null and not exists (select 1 from public.truck_loans x where x.truck_id = m.truck_id);

update public.trucks t set
  purchase_price = coalesce(m.price, t.purchase_price),
  value = coalesce(m.value, t.value),
  value_on = case when m.value is not null then '2026-10-01'::date else t.value_on end,
  mileage = case when m.miles is not null and (t.mileage_on is null or t.mileage_on <= '2026-10-01') then m.miles else t.mileage end,
  mileage_on = case when m.miles is not null and (t.mileage_on is null or t.mileage_on <= '2026-10-01') then '2026-10-01'::date else t.mileage_on end
from d_match m where t.id = m.truck_id;

-- ===== The SBA loan and the credit cards / lines =====
insert into public.debts (name, kind, lender, payment, start_on, end_on, rate, rate_note, original, balance, balance_on, purpose, sort)
select 'SBA loan', 'long', 'SBA Loan Center', 21797.43, '2026-07-17', '2040-07-16', null, 'Prime + ?%', 2070000, 2070000, '2026-07-17',
       'SBA refinance: $1 million in short and long term debt, $968,610.06 in working capital, and paid off about $600,000 in other lending.', 1
where not exists (select 1 from public.debts where name = 'SBA loan');

insert into public.debts (name, kind, lender, payment, rate, credit_limit, balance, balance_on, sort)
select v.name, 'card', v.lender, 0, v.rate, v.lim, v.bal, '2026-07-17', v.sort
from (values
  ('American Express 81005', 'American Express', 29.99, 75000, 0, 1),
  ('American Express 82009', 'American Express', 26.49, 1500, 0, 2),
  ('Capital on Tap', 'Capital on Tap', null, 40000, 0, 3),
  ('Capital One 6684', 'Capital One', 26.64, 10000, 0, 4),
  ('Chase Ink 8072', 'Chase', 29.99, 16000, 0, 5),
  ('Chase Unlimited PPS 5380', 'Chase', 16.99, 15000, 0, 6),
  ('Chase Unlimited West 4712', 'Chase', 16.99, 10000, 0, 7),
  ('Chase Unlimited East', 'Chase', 16.99, 15000, 0, 8),
  ('US Bank', 'US Bank', 22.24, 13000, -119.68, 9),
  ('Costco Citi', 'Citi', 25.49, 7200, 0, 10)
) v(name, lender, rate, lim, bal, sort)
where not exists (select 1 from public.debts d where d.name = v.name);

commit;

-- Check
select 'truck loans on file' as what, count(*)::text || ' (' || count(*) filter (where not paid_off) || ' being paid, '
       || to_char(coalesce(sum(payment) filter (where not paid_off), 0), 'FM$999,999,990.00') || ' a month)' as detail from public.truck_loans
union all select 'other debts', count(*)::text || ' (' || to_char(coalesce(sum(payment), 0), 'FM$999,999,990.00') || ' a month)' from public.debts
union all select 'loan sheet row with no truck: #' || truck_no, vin from (
  select d.truck_no, d.vin, coalesce((select t.id from public.trucks t where t.vin = d.vin),
    (select t.id from public.trucks t where t.truck_no = d.truck_no and t.status in ('active', 'for_sale') limit 1)) as id from d_in d) x
  where id is null;
