-- 2026-11-21. The truck sheet, from John's two spreadsheet photos (fleet sheet by office + the loan / for-sale sheet).
-- Run AFTER change 75. Safe to run twice: matched by VIN, so it updates instead of adding twice.
-- Not copied on purpose: loan account numbers and the AutoPay column.
-- Drivers: matched to people in the app by full name; anyone not matched stays as a note on the truck
-- ("No driver, why") for a manager to pick from the list.

begin;

create temporary table t_in (
  truck_no text, vin text, year int, make text, model text, office text, driver text, status text,
  plate text, tag_month text, county text, insurer text, ins_yearly numeric, gas_card text, toolbox text,
  key_tag text, samsara boolean, peach text, notes text
) on commit drop;

insert into t_in values
-- ===== Atlanta West =====
('119','3TYAX5GN8NT035960',2022,'Toyota','Tacoma','west','Spare','for_sale','CSX6908','December','Gwinnett','Acuity',5586,'119',null,null,true,'2887994',null),
('121','3TYRX5GN6NT053425',2022,'Toyota','Tacoma','west','No driver','for_sale','CUD9856','August','Cobb','Acuity',5586,'121',null,null,true,'2887996',null),
('122','3TYRX5GN5PT072284',2023,'Toyota','Tacoma','west','No driver','active','CWF4306','August','Cobb','Acuity',5612,'122','B010',null,true,'2887997',null),
('124','3TYRX5GN7PT076724',2023,'Toyota','Tacoma','west','Shiron Cook','active','CWP2510','August','Cobb','Acuity',5612,'124',null,null,true,'2887999',null),
('128','1GCNCPEC5EZ309619',2014,'Chevrolet','Silverado (rig)','west','Liquids rig, no tech assigned','for_sale','TEA2540','October','Paulding','Acuity',4348,'128',null,null,true,null,null),
('129','7G2CEHED8RA015590',2024,'Tesla','Cybertruck','west','Shiron Cook','active','DAI8200','August',null,'Acuity',7393,'129','No toolbox','No toolbox',false,'3309916',null),
('130','1N6ED1CL9RN668849',2024,'Nissan','Frontier','west','Robert King','active','DAI7414',null,null,'Acuity',5977,'130','B013','B013',true,'3309917',null),
('210','3TYRX5GN5PT076195',2023,'Toyota','Tacoma','west','Zach Fonticoba','active','CWP3065','August','Cobb','Acuity',5854,'210',null,null,true,'3309921',null),
('215','3TYKD5HNXRT001424',2024,'Toyota','Tacoma','west','Kenneth Todd','active','CZT5238','August','Cobb','Acuity',5719,'215',null,null,false,'3309922',null),
('218','3TYKD5HN3RT000731',2024,'Toyota','Tacoma','west','Branden Logan','active','SHB7230',null,null,'Acuity',5719,'218','B010','B010',true,'3309923',null),
('219','1N6ED1CL7RN611744',2024,'Nissan','Frontier','west','Jacari Harris','active','SGT4967','August','Cobb','Acuity',5977,'219','B020','B020',true,'3309924',null),
('599','1N6ED1CL9SN625599',2025,'Nissan','Frontier','west','No driver','active','DCR4636',null,null,'Acuity',6167,'123',null,null,true,'3309925',null),
('084','1N6ED1CL0SN610084',2025,'Nissan','Frontier','west','No driver','active','DCS6416',null,null,'Acuity',6167,null,null,null,true,'3309926',null),
('639','1N6ED1CM9RN655639',2024,'Nissan','Frontier','west','Mark Oldfield','active','TEMP TAG','August',null,'Acuity',6153,null,null,null,true,null,null),
('445','1N6ED1CM1RN656445',2024,'Nissan','Frontier','west','No driver','active','DDX1923','August',null,'Acuity',6153,null,null,null,true,null,null),
('002','3TYJDAHN3ST023002',2025,'Toyota','Tacoma','west','No driver','active',null,'August',null,'Acuity',6167,null,null,null,true,null,'Sheet says model "Toyota"'),
('746','1N6ED1CL1SN659746',2025,'Nissan','Frontier','west','Brandon Byram','active','DEE5441','August',null,'Acuity',5996,null,null,null,true,null,null),
('213','3TYRX5GN0PT076430',2023,'Toyota','Tacoma','west','Miles Massengill','active','CWX7478','August','Cobb','Acuity',5612,'213','K775','K775',true,'33099','Peach Pass number looks cut off on the sheet'),
('933','1FTBR1Y82SKB26933',2026,'Ford','Transit','west','Samuel Scott','active','DGR6264','August','Cobb','Acuity',6452,null,null,null,true,null,null),
('979','1N6ED1CM6RN654979',2024,'Nissan','Frontier','west','No driver','active','SMC9914','August','Cobb','Acuity',6153,null,null,null,true,null,null),
('394','1N6ED1CL7TN655394',2026,'Nissan','Frontier','west','Adam Townsend','active','DHC3056',null,null,'Acuity',6167,null,null,null,true,null,null),
('211','3TYRX5GN4NT061023',2022,'Toyota','Tacoma','west','No driver','for_sale','SCU8896','August','Cobb','Acuity',5586,'211','B038','B038',true,'3309905',null),
('943','1N6ED1CLXTN663943',2026,'Nissan','Frontier','west','Robert Elbertson','active',null,null,null,null,6167,null,null,null,true,null,null),
('300','1N6ED1CL8TN671300',2026,'Nissan','Frontier','west','Carlos Finch','active','TEMP TAG',null,null,null,6167,null,null,null,true,null,null),
('483','1N6ED1CL8TN673483',2026,'Nissan','Frontier','west','Michael Rucker','active','DHK1225','August','Cobb','Acuity',null,null,null,null,true,null,'Insurance cost was "?" on the sheet'),
('796','1FTBR1Y8XVKA27796',2026,'Ford','Transit','west','Bryan Koons','active','TEMP TAG',null,null,null,null,null,null,null,false,null,null),
-- ===== Atlanta East =====
('117','3TYRZ5CN8MT011935',2021,'Toyota','Tacoma','east','No driver','for_sale','CSM2884','August','Cobb','Acuity',5552,null,null,null,false,'2887992',null),
('118','3TYRZ5CN9MT011877',2021,'Toyota','Tacoma','east','Adin Sanford','for_sale','CSM1510','August','Cobb','Acuity',5586,'XXJ028','S1257','S1257',true,'2887993',null),
('120','3TYRX5GN3NT056248',2022,'Toyota','Tacoma','east','No driver','for_sale','CUG4259','March','Gwinnett','USAA',5703,null,'B030','B030',true,'2887996',null),
('125','3TYRX5GN2PT078793',2023,'Toyota','Tacoma','east','Juwon Williams','active','SCV0368','August','Cobb','Acuity',5612,'XXJ060','B024','B024',true,'2888000',null),
('207','3TYRX5GN9NT047652',2022,'Toyota','Tacoma','east','No driver','for_sale','CTX5057','December','Gwinnett','Acuity',5586,null,null,null,false,'3309904',null),
('212','3TYRX5GN1PT076744',2023,'Toyota','Tacoma','east','Drake (old truck)','active','CWS4270','August','Cobb','Acuity',5612,null,'B047','B047',true,'3309906',null),
('214','3TYKD5HN3RT000762',2024,'Toyota','Tacoma','east','Lisa Schaal','active','SPG6980','August','Cobb','Acuity',5719,'XXJ024','B038','B038',true,'3309908',null),
('216','7G2CEHED1RA008335',2024,'Tesla','Cybertruck','east','John Ely','active','CZW4468','August','Cobb','USAA',7026,null,'No toolbox','No toolbox',false,'2876057',null),
('217','1N6ED1CL4RN655443',2024,'Nissan','Frontier','east','Brandon Price','active','SGT4968','August','Cobb','Acuity',5977,'XXJ027','B020','B020',true,'3309909',null),
('220','1N6ED1CL0RN654273',2024,'Nissan','Frontier','east','Keon Powell','active','SHR4374','August','Cobb','Acuity',5826,'XXJ003','B030','B030',true,'3566308',null),
('221','1N6ED1CL6RN654732',2024,'Nissan','Frontier','east','Jarvis Sigler','active','SHN4909','August','Cobb','Acuity',5826,'XXJ025','B732','B732',true,'3309911',null),
('123','3TYRX5GN0NT061018',2022,'Toyota','Tacoma','east','No driver','for_sale','SCU8947','August','Cobb','Acuity',5586,null,null,null,false,'2887998','Needs glass repair'),
('373','1N6ED1CLXRN675373',2024,'Nissan','Frontier','east','Shellie Boyd','active','DCR7146','August','Cobb','Acuity',6153,'XXJ050','K784','K784',true,'3309912',null),
('685','1N6ED1CL4SN610685',2025,'Nissan','Frontier','east','DeMarcus Usher','active','DDG6301','August','Cobb','Acuity',5996,'XXJ057','B007','B007',true,'3309913',null),
('706','1N6ED1CL6RN674706',2024,'Nissan','Frontier','east','Brian Perkins','active','DCQ4898','August','Cobb','Acuity',5991,'XXJ002','S1257','S1257',true,'3309915',null),
('16','1N6ED1CL0TN649016',2026,'Nissan','Frontier','east','Angel (body shop)','active','DGJ2795','August','Cobb','Acuity',5829,null,'B029','B029',true,'3566309',null),
('159','1N6ED1CL3TN632159',2026,'Nissan','Frontier','east','Office (Tasj''s old truck)','active','DGJ2803','August','Cobb','Acuity',5829,null,'K86','K86',true,'3566310',null),
('273','1N6ED1CL3RN670273',2024,'Nissan','Frontier','east','Bart Jordan','active','DAQ5968','August','Gwinnett','USAA (John''s personal)',5826,'XXJ017','B030','B030',true,null,'Peach Pass ordered again 9/9'),
('492','1N6ED1CL9TN673492',2026,'Nissan','Frontier','east','Amanda Erickson','active','DHC3059','August','Cobb','Acuity',6167,'XXJ008','B007','B007',true,'3566311','VIN on the sheet has an I where an L belongs (1N6ED1CI9...); fixed to L'),
('30','1N6ED1CL9TN652030',2026,'Nissan','Frontier','east','Alonzo Gradney','active','SYN7753','August','Cobb','Acuity',6167,'XXJ015','B032','B032',true,'3566312',null),
('183','1N6ED1CL7TN673183',2026,'Nissan','Frontier','east','Micheal Williams','active','SPT3755','August','Cobb','Acuity',6167,'XXJ021','K799','K799',true,null,null),
('805','1N6ED1CL4TN673805',2026,'Nissan','Frontier','east','Gio Rebollar','active','DHP7335','August','Cobb','Acuity',6167,'XXJ058','K752','K752',true,null,null),
('82','1N6ED1CL6TN674082',2026,'Nissan','Frontier','east','Adiyah Mack','active','DHG2617','August','Cobb','Acuity',6167,'XXJ047','K763','K763',true,null,null),
-- ===== Atlanta South =====
('208','1N6ED1EJ9NN661955',2022,'Nissan','Frontier','south','Oscar Ayala','for_sale','CUD9082','August','Cobb','Acuity',5722,'Manager 8','K757','K757',true,'3309903',null),
('388','1N6ED1CL8SN623388',2025,'Nissan','Frontier','south','Joshua Baker','active','DDI2808','August','Cobb','Acuity',5703,null,'B050','B050',true,'3309914','Driver had a "?" on the sheet'),
('693','1N6ED1CL0TN601693',2026,'Nissan','Frontier','south','Eddy','active','TEMP TAG','August','Cobb','Acuity',5829,null,'S1257','S1257',true,null,null),
('462','1N6ED1CL2TN658462',2026,'Nissan','Frontier','south','LaTegra','active','TEMP TAG','August','Cobb','Acuity',6167,null,'B032','B032',false,null,null);

insert into public.trucks (truck_no, vin, year, make, model, office, driver_note, status, plate, tag_month, county, insurer,
                           insurance_yearly, gas_card, toolbox, key_tag, samsara, peach_pass, notes)
select truck_no, vin, year, make, model, office, driver, status, plate, tag_month, county, insurer,
       ins_yearly, gas_card, toolbox, key_tag, samsara, peach, notes
from t_in
on conflict (vin) do update set
  truck_no = excluded.truck_no, year = excluded.year, make = excluded.make, model = excluded.model, office = excluded.office,
  driver_note = excluded.driver_note, status = excluded.status, plate = excluded.plate, tag_month = excluded.tag_month,
  county = excluded.county, insurer = excluded.insurer, insurance_yearly = excluded.insurance_yearly, gas_card = excluded.gas_card,
  toolbox = excluded.toolbox, key_tag = excluded.key_tag, samsara = excluded.samsara, peach_pass = excluded.peach_pass,
  notes = excluded.notes, updated_at = now();

-- Drivers: full-name match (first + last) to an active person; matched ones lose the note
update public.trucks t set driver_id = e.id, driver_note = null
from t_in i, public.employees e
where t.vin = i.vin and e.active
  and lower(trim(e.first_name) || ' ' || trim(e.last_name)) = lower(i.driver)
  and (select count(*) from public.employees x where x.active and lower(trim(x.first_name) || ' ' || trim(x.last_name)) = lower(i.driver)) = 1;
update public.trucks set driver_note = null where driver_note = 'No driver';

-- ===== Mileage, price and value (loan sheet, as of Oct 1, 2026) and the loans =====
create temporary table l_in (
  vin text, miles int, price numeric, value numeric, lender text, payment numeric, start_on date, end_on date,
  financed numeric, rate numeric, balance numeric
) on commit drop;
insert into l_in values
('3TYAX5GN8NT035960', 95939, 37800, 22810, 'Santander',          770.66, '2022-01-01', '2027-12-14', 37799.89, 13.75, 0),
('3TYRX5GN6NT053425', 80584, 35625, 21030, 'Renasant',           459.02, '2022-05-02', '2029-04-30', 21637.77, 5.25,  0),
('3TYRX5GN4NT061023', 71771, 30503, 22610, 'Ally',               533.62, '2023-03-24', '2028-03-22', 25503.47, 9.34,  0),
('3TYRZ5CN8MT011935', 74377, 35689, 24740, 'Chase',              595.34, '2021-10-31', '2026-10-30', 35688.78, 6.14,  0),
('3TYRX5GN9NT047652', 82086, 36006, 21550, 'USAA',               649.67, '2022-04-21', '2027-04-20', 36006.18, 4.89,  0),
('3TYRX5GN0NT061018', 67897, 30503, 23010, 'Ally',               533.62, '2023-03-24', '2028-03-22', 25503.47, 9.34,  0),
('3TYRX5GN3NT056248', 74690, 33243, 21360, 'USAA',               649.67, '2022-06-03', '2027-06-02', 33243.17, 4.89,  10994.46),
('1GCNCPEC5EZ309619', 222718, null, 4000,  null,                 null,   null,         null,         null,     null,  null),
('3TYRZ5CN9MT011877', 98814, 31490, 23040, 'Chase',              714.70, '2021-10-18', '2026-10-17', 31490.00, 5.99,  0),
('1N6ED1EJ9NN661955', 70605, 33889, 19030, 'Nissan Finance',     546.74, '2022-04-30', '2027-04-29', 33889.10, 4.99,  9769.69);

update public.trucks t set mileage = l.miles, mileage_on = '2026-10-01', purchase_price = l.price, value = l.value, value_on = '2026-10-01'
from l_in l where t.vin = l.vin;

insert into public.truck_loans (truck_id, lender, payment, start_on, end_on, financed, rate, balance, balance_on, paid_off)
select t.id, l.lender, l.payment, l.start_on, l.end_on, l.financed, l.rate, l.balance, '2026-10-01', coalesce(l.balance, 0) = 0
from l_in l join public.trucks t on t.vin = l.vin
where l.lender is not null and not exists (select 1 from public.truck_loans x where x.truck_id = t.id);

commit;

-- Check: the counts, and drivers that didn't match anyone in the app
select 'trucks on the sheet' as what, count(*)::text as detail from public.trucks where status in ('active', 'for_sale')
union all select 'for sale', count(*)::text from public.trucks where status = 'for_sale'
union all select 'with a driver matched', count(*)::text from public.trucks where driver_id is not null
union all select 'loans', count(*)::text || ' (' || count(*) filter (where not paid_off) || ' still owed)' from public.truck_loans
union all select 'driver not matched: #' || truck_no, driver_note from public.trucks
  where driver_id is null and driver_note is not null and driver_note not ilike 'no driver%' and status in ('active', 'for_sale');
