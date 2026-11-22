-- 83 (2026-11-21). Wildlife trucks (John): the Ford Transits (933 and 796) are the wildlife team's. A "Wildlife team
-- truck" switch on each truck (managers and up), shown and filterable on the truck sheet, Debt and Maintenance.
-- The truck keeps its office (where it's kept); the switch says which side of the business it belongs to.
-- Also: LEAF Capital's first payment came out 11/20/2026 (ACH "LEASE SERVICES"), so 30 payments run to 4/20/2029.
-- Safe to run twice.

begin;

alter table public.trucks add column if not exists wildlife boolean not null default false;

create or replace function public.set_truck_wildlife(p_truck uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare was boolean;
begin
  if not can_see_trucks() then raise exception 'Only managers and up can change trucks.'; end if;
  select wildlife into was from trucks where id = p_truck;
  if not found then raise exception 'That truck isn''t on the sheet.'; end if;
  if was = coalesce(p_on, false) then return; end if;
  update trucks set wildlife = coalesce(p_on, false), updated_at = now(), updated_by = my_id() where id = p_truck;
  insert into truck_log (truck_id, kind, text) values (p_truck, 'moved', case when p_on then 'Now a wildlife team truck' else 'No longer a wildlife team truck' end);
end $$;
revoke all on function public.set_truck_wildlife(uuid, boolean) from public, anon;
grant execute on function public.set_truck_wildlife(uuid, boolean) to authenticated;

create or replace function public.trucks_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  money boolean := can_see_finance();
  result jsonb;
begin
  if not can_see_trucks() then return null; end if;
  select jsonb_build_object(
    'trucks', (select coalesce(jsonb_agg(x order by x.office nulls last, x.truck_no), '[]') from (
        select t.id, t.truck_no, t.vin, t.wildlife, t.year, t.make, t.model, t.office, t.driver_id, t.driver_note, t.status,
               t.plate, t.tag_month, t.county, t.insurer, t.gas_card, t.toolbox, t.key_tag, t.samsara, t.peach_pass,
               t.mileage, t.mileage_on, t.notes, t.removed_on, t.removed_reason,
               case when d.id is not null then d.first_name || ' ' || d.last_name end as driver,
               t.insurance_yearly,
               case when money then t.bought_on end as bought_on,
               case when money then t.purchase_price end as purchase_price,
               case when money then t.value end as value,
               case when money then t.value_on end as value_on,
               case when money then t.sold_price end as sold_price,
               case when money then t.sold_to end as sold_to,
               case when money then (select coalesce(jsonb_agg(to_jsonb(l) - 'truck_id' order by l.start_on), '[]')
                                     from truck_loans l where l.truck_id = t.id) end as loans,
               case when money then (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name, 'size', c.size,
                                       'mime', c.mime, 'created_at', c.created_at, 'qbo_attachable_id', c.qbo_attachable_id,
                                       'qbo_result', c.qbo_result) order by c.created_at), '[]')
                                     from truck_documents c where c.truck_id = t.id) end as documents,
               (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'day', g.day, 'kind', g.kind, 'text', g.text,
                          'cost', case when money or g.kind = 'maintenance' then g.cost end, 'miles', g.miles,
                          'by', b.first_name || ' ' || b.last_name, 'emailed_at', g.emailed_at, 'email_result', g.email_result)
                        order by g.day desc, g.created_at desc), '[]')
                from (select * from truck_log where truck_id = t.id order by day desc, created_at desc limit 40) g
                left join employees b on b.id = g.by_id) as log
        from trucks t left join employees d on d.id = t.driver_id) x),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name,
                 'office', e.office, 'department', e.department) order by e.first_name, e.last_name), '[]')
               from employees e where e.active),
    'settings', (select case when money then to_jsonb(s) - 'id' else jsonb_build_object('insurance_name', s.insurance_name, 'bookkeeper_name', s.bookkeeper_name) end
                 from fleet_settings s where id = 1),
    'money', money,
    'rank', my_rank()
  ) into result;
  return result;
end $$;
revoke all on function public.trucks_data() from public, anon;
grant execute on function public.trucks_data() to authenticated;

create or replace function public.debt_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  last_month date := (select max(month) from qbo_bs_monthly);
  result jsonb;
begin
  if not can_see_finance() then return null; end if;
  select jsonb_build_object(
    'truck_loans', (select coalesce(jsonb_agg(x order by x.truck_no), '[]') from (
        select l.*, t.truck_no, t.year, t.make, t.model, t.office, t.status as truck_status, t.vin, t.wildlife
        from truck_loans l join trucks t on t.id = l.truck_id) x),
    'debts', (select coalesce(jsonb_agg(to_jsonb(d) order by d.kind, d.sort, d.name), '[]') from debts d),
    'bs_month', last_month,
    'accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', b.account_id, 'name', b.account_name, 'parent', b.parent_name,
                   'grp', b.grp, 'section', b.section, 'amount', b.amount) order by b.grp, b.account_name), '[]')
                 from qbo_bs_monthly b where b.month = last_month),
    'history', (select coalesce(jsonb_agg(x order by x.month), '[]') from (
        select month, sum(amount) filter (where section = 'Liabilities') as liabilities,
               sum(amount) filter (where grp = 'CreditCards') as cards,
               sum(amount) filter (where grp = 'LongTermLiabilities') as long_term
        from qbo_bs_monthly group by 1) x),
    'profit', (select coalesce(jsonb_agg(x order by x.month), '[]') from (
        select month,
               sum(case when section in ('Income', 'Other Income') then amount else -amount end) as net,
               sum(amount) filter (where section in ('Expenses', 'Other Expenses') and account_name ilike '%interest%') as interest
        from qbo_pl_monthly group by 1) x),
    'connection', (select jsonb_build_object('connected', refresh_token is not null, 'last_sync_at', last_sync_at,
                     'last_sync_error', last_sync_error, 'bs_sync_error', bs_sync_error) from qbo_connection where id = 1)
  ) into result;
  return result;
end $$;
revoke all on function public.debt_data() from public, anon;
grant execute on function public.debt_data() to authenticated;

create or replace function public.maintenance_data(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not can_see_trucks() or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then return null; end if;
  select jsonb_build_object(
    'trucks', (select coalesce(jsonb_agg(x order by x.office nulls last, x.truck_no), '[]') from (
        select t.id, t.truck_no, t.year, t.make, t.model, t.office, t.status, t.wildlife, t.driver_note,
               case when d.id is not null then d.first_name || ' ' || d.last_name end as driver,
               t.mileage, t.mileage_on, t.odometer, t.odometer_at,
               (select jsonb_build_object('day', g.day, 'miles', g.miles, 'cost', g.cost)
                  from truck_log g where g.truck_id = t.id and g.kind = 'maintenance' and g.service = 'oil'
                  order by g.day desc, g.created_at desc limit 1) as last_oil
        from trucks t left join employees d on d.id = t.driver_id
        where t.status in ('active', 'for_sale')) x),
    'entries', (select coalesce(jsonb_agg(x order by x.day desc, x.created_at desc), '[]') from (
        select g.id, g.truck_id, g.day, g.text, g.cost, g.miles, g.service, g.created_at, t.truck_no, t.office, t.wildlife,
               concat_ws(' ', t.year, t.make, t.model) as vehicle, b.first_name || ' ' || b.last_name as by
        from truck_log g join trucks t on t.id = g.truck_id left join employees b on b.id = g.by_id
        where g.kind = 'maintenance' and g.day between p_from and p_to) x),
    'rules', (select jsonb_build_object('miles', oil_every_miles, 'months', oil_every_months) from fleet_settings where id = 1),
    'can_set_rules', coalesce(my_rank() >= 4, false)
  ) into result;
  return result;
end $$;
revoke all on function public.maintenance_data(date, date) from public, anon;
grant execute on function public.maintenance_data(date, date) to authenticated;

-- The two Transits
update public.trucks set wildlife = true, updated_at = now() where vin in ('1FTBR1Y82SKB26933', '1FTBR1Y8XVKA27796') and not wildlife;

-- LEAF Capital: first payment 11/20/2026
update public.debts set start_on = '2026-11-20', end_on = '2029-04-20', updated_at = now()
where name = 'LEAF Capital (CapitalNOW)' and start_on is null;

commit;

-- Check
select 'wildlife trucks' as what, coalesce(string_agg(truck_no || ' ' || concat_ws(' ', year, make, model), ', '), '(none)') as detail from public.trucks where wildlife
union all
select 'LEAF Capital', coalesce(start_on::text, '?') || ' to ' || coalesce(end_on::text, '?') from public.debts where name = 'LEAF Capital (CapitalNOW)';
