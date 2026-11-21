-- 80 (2026-11-21). Managers run the truck sheet (John, 2026-11-21): "anyone that is a manager ... anything to do with
-- that truck sheet." Managers and up (not leads; can_see_trucks) now also:
--  * add trucks (the insurance + bookkeeper "added" email goes out), switch For sale, mark Sold / Off the fleet
--    (the "removed" email), and change the VIN and the yearly insurance cost.
--  Still C-Suite / the President with the authenticator step: loans, purchase price, value, documents (agreements),
--  the email addresses, and the debt schedule. The sale price a manager types in goes on the truck and in the
--  bookkeeper's email, but only C-Suite sees it on the sheet.
-- Safe to run twice.

begin;

create or replace function public.save_truck(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  money boolean := can_see_finance();
  v uuid := p_id;
  ev uuid;
  txt text := nullif(trim(coalesce(p ->> 'vin', '')), '');
begin
  if not can_see_trucks() then raise exception 'Only managers and up can change trucks.'; end if;
  if v is null then
    insert into trucks (vin, status) values (upper(replace(txt, ' ', '')), 'active') returning id into v;
    insert into truck_log (truck_id, kind, day, text)
    values (v, 'added', coalesce((p ->> 'bought_on')::date, (now() at time zone 'America/New_York')::date), 'Added to the fleet')
    returning id into ev;
  end if;
  update trucks set
    truck_no    = case when p ? 'truck_no' then nullif(trim(p ->> 'truck_no'), '') else truck_no end,
    vin         = case when p ? 'vin' and txt is not null then upper(replace(txt, ' ', '')) else vin end,
    year        = case when p ? 'year' then nullif(p ->> 'year', '')::integer else year end,
    make        = case when p ? 'make' then nullif(trim(p ->> 'make'), '') else make end,
    model       = case when p ? 'model' then nullif(trim(p ->> 'model'), '') else model end,
    plate       = case when p ? 'plate' then nullif(upper(trim(p ->> 'plate')), '') else plate end,
    tag_month   = case when p ? 'tag_month' then nullif(trim(p ->> 'tag_month'), '') else tag_month end,
    county      = case when p ? 'county' then nullif(trim(p ->> 'county'), '') else county end,
    insurer     = case when p ? 'insurer' then nullif(trim(p ->> 'insurer'), '') else insurer end,
    gas_card    = case when p ? 'gas_card' then nullif(trim(p ->> 'gas_card'), '') else gas_card end,
    toolbox     = case when p ? 'toolbox' then nullif(trim(p ->> 'toolbox'), '') else toolbox end,
    key_tag     = case when p ? 'key_tag' then nullif(trim(p ->> 'key_tag'), '') else key_tag end,
    samsara     = case when p ? 'samsara' then coalesce((p ->> 'samsara')::boolean, false) else samsara end,
    peach_pass  = case when p ? 'peach_pass' then nullif(trim(p ->> 'peach_pass'), '') else peach_pass end,
    mileage     = case when p ? 'mileage' then nullif(regexp_replace(p ->> 'mileage', '[,\s]', '', 'g'), '')::integer else mileage end,
    mileage_on  = case when p ? 'mileage' and nullif(p ->> 'mileage', '') is not null then (now() at time zone 'America/New_York')::date else mileage_on end,
    notes       = case when p ? 'notes' then nullif(trim(p ->> 'notes'), '') else notes end,
    office      = case when p_id is null and p ? 'office' then nullif(p ->> 'office', '') else office end,
    insurance_yearly = case when p ? 'insurance_yearly' then nullif(regexp_replace(p ->> 'insurance_yearly', '[$,\s]', '', 'g'), '')::numeric else insurance_yearly end,
    bought_on      = case when money and p ? 'bought_on' then nullif(p ->> 'bought_on', '')::date else bought_on end,
    purchase_price = case when money and p ? 'purchase_price' then nullif(regexp_replace(p ->> 'purchase_price', '[$,\s]', '', 'g'), '')::numeric else purchase_price end,
    value          = case when money and p ? 'value' then nullif(regexp_replace(p ->> 'value', '[$,\s]', '', 'g'), '')::numeric else value end,
    value_on       = case when money and p ? 'value' and nullif(p ->> 'value', '') is not null then coalesce(nullif(p ->> 'value_on', '')::date, (now() at time zone 'America/New_York')::date) else value_on end,
    updated_at = now(), updated_by = my_id()
  where id = v;
  return jsonb_build_object('id', v, 'event', ev);
end $$;
revoke all on function public.save_truck(uuid, jsonb) from public, anon;
grant execute on function public.save_truck(uuid, jsonb) to authenticated;

create or replace function public.set_truck_status(p_truck uuid, p_status text, p_day date, p_price numeric, p_to text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare old text; ev uuid; d date := coalesce(p_day, (now() at time zone 'America/New_York')::date);
begin
  if not can_see_trucks() then raise exception 'Only managers and up can sell or remove trucks.'; end if;
  if p_status not in ('active', 'for_sale', 'sold', 'gone') then raise exception 'Unknown status.'; end if;
  select status into old from trucks where id = p_truck;
  if not found then raise exception 'That truck isn''t on the sheet.'; end if;
  if p_status in ('sold', 'gone') then
    update trucks set status = p_status, removed_on = d, sold_price = case when p_status = 'sold' then p_price end,
           sold_to = nullif(trim(coalesce(p_to, '')), ''), removed_reason = nullif(trim(coalesce(p_reason, '')), ''),
           driver_id = null, updated_at = now(), updated_by = my_id()
    where id = p_truck;
    insert into truck_log (truck_id, kind, day, text)
    values (p_truck, 'removed', d, case when p_status = 'sold' then 'Sold' || coalesce(' for $' || to_char(p_price, 'FM999,999,990.00'), '') || coalesce(' to ' || nullif(trim(p_to), ''), '')
                                        else 'Off the fleet' || coalesce(': ' || nullif(trim(p_reason), ''), '') end)
    returning id into ev;
  else
    update trucks set status = p_status, removed_on = case when p_status = 'active' and old in ('sold', 'gone') then null else removed_on end,
           updated_at = now(), updated_by = my_id()
    where id = p_truck;
    if old in ('sold', 'gone') then
      insert into truck_log (truck_id, kind, day, text) values (p_truck, 'added', d, 'Back on the fleet') returning id into ev;
    elsif old is distinct from p_status then
      insert into truck_log (truck_id, kind, day, text) values (p_truck, 'for_sale', d, case when p_status = 'for_sale' then 'Up for sale' else 'Not for sale any more' end);
    end if;
  end if;
  return ev;
end $$;
revoke all on function public.set_truck_status(uuid, text, date, numeric, text, text) from public, anon;
grant execute on function public.set_truck_status(uuid, text, date, numeric, text, text) to authenticated;

create or replace function public.trucks_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  money boolean := can_see_finance();
  result jsonb;
begin
  if not can_see_trucks() then return null; end if;
  select jsonb_build_object(
    'trucks', (select coalesce(jsonb_agg(x order by x.office nulls last, x.truck_no), '[]') from (
        select t.id, t.truck_no, t.vin, t.year, t.make, t.model, t.office, t.driver_id, t.driver_note, t.status,
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

commit;

-- Check
select 'managers run the truck sheet' as what, 'ready' as detail;
