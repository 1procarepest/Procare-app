-- 75 (2026-11-21). Operations -> Trucks: the truck sheet in the app (John, 2026-11-21).
--  * trucks: every truck, its office, driver, tag, insurance, gas card, toolbox, key, Peach Pass, miles.
--    Status: active, for_sale, sold, gone (totaled, returned, ...). Sold and gone trucks drop off the sheet
--    but stay in the history.
--  * truck_loans: the loan on each truck (lender, payment, dates, rate, balance). No loan account numbers.
--  * truck_log: notes and maintenance per truck, plus added / sold / moved / driver changes. Adding or
--    removing a truck emails the insurance agent (Jared Sobelson) and the bookkeeper (Ekaterina, PCO
--    Bookkeepers): /api/fleet-notice, addresses in fleet_settings.
--  * Who: managers and up see the trucks, set the driver and office, and add notes and maintenance.
--    Money (loans, value, prices), adding, selling and the email addresses: C-Suite and the President with the
--    authenticator step (can_see_finance, change 67).
-- Safe to run twice.

begin;

create table if not exists public.trucks (
  id               uuid primary key default gen_random_uuid(),
  truck_no         text,
  vin              text unique,
  year             integer,
  make             text,
  model            text,
  office           text references public.offices(key),
  driver_id        uuid references public.employees(id) on delete set null,
  driver_note      text,                    -- "No Driver", "Spare", "Liquids rig", "Body shop" ...
  status           text not null default 'active' check (status in ('active', 'for_sale', 'sold', 'gone')),
  plate            text,
  tag_month        text,
  county           text,
  insurer          text,
  insurance_yearly numeric(10,2),
  gas_card         text,
  toolbox          text,
  key_tag          text,
  samsara          boolean not null default false,
  peach_pass       text,
  mileage          integer,
  mileage_on       date,
  bought_on        date,
  purchase_price   numeric(12,2),
  value            numeric(12,2),
  value_on         date,
  removed_on       date,
  sold_price       numeric(12,2),
  sold_to          text,
  removed_reason   text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.employees(id) on delete set null default public.my_id()
);

create table if not exists public.truck_loans (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references public.trucks(id) on delete cascade,
  lender     text,
  payment    numeric(10,2),
  start_on   date,
  end_on     date,
  financed   numeric(12,2),
  rate       numeric(6,3),                  -- percent, 4.89 = 4.89%
  balance    numeric(12,2),
  balance_on date,
  paid_off   boolean not null default false,
  notes      text,
  updated_at timestamptz not null default now()
);
create index if not exists truck_loans_truck on public.truck_loans (truck_id);

create table if not exists public.truck_log (
  id           uuid primary key default gen_random_uuid(),
  truck_id     uuid not null references public.trucks(id) on delete cascade,
  day          date not null default (now() at time zone 'America/New_York')::date,
  kind         text not null check (kind in ('note', 'maintenance', 'added', 'removed', 'for_sale', 'moved', 'driver')),
  text         text,
  cost         numeric(10,2),
  miles        integer,
  by_id        uuid references public.employees(id) on delete set null default public.my_id(),
  created_at   timestamptz not null default now(),
  emailed_at   timestamptz,
  email_result text
);
create index if not exists truck_log_truck on public.truck_log (truck_id, day desc);

create table if not exists public.fleet_settings (
  id               integer primary key default 1 check (id = 1),
  insurance_name   text default 'Jared Sobelson',
  insurance_email  text default 'jaredsobelson@pninsurance.com',
  bookkeeper_name  text default 'Ekaterina (PCO Bookkeepers)',
  bookkeeper_email text,
  reply_to         text default 'john@procarepest.com'
);
insert into public.fleet_settings (id) values (1) on conflict (id) do nothing;

alter table public.trucks enable row level security;
alter table public.truck_loans enable row level security;
alter table public.truck_log enable row level security;
alter table public.fleet_settings enable row level security;
revoke all on public.trucks, public.truck_loans, public.truck_log, public.fleet_settings from anon, authenticated;

drop trigger if exists log_trucks on public.trucks;
create trigger log_trucks after insert or delete or update on public.trucks for each row execute function log_change();
drop trigger if exists log_truck_loans on public.truck_loans;
create trigger log_truck_loans after insert or delete or update on public.truck_loans for each row execute function log_change();

-- Managers and up (not the wildlife department) see the trucks
create or replace function public.can_see_trucks()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e where e.id = my_id() and e.active and level_rank(e.level) >= 3 and e.department::text <> 'wildlife')
$$;
revoke all on function public.can_see_trucks() from public, anon;
grant execute on function public.can_see_trucks() to authenticated;

-- Everything on the Trucks page in one call. Money only for can_see_finance().
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
               case when money then t.insurance_yearly end as insurance_yearly,
               case when money then t.bought_on end as bought_on,
               case when money then t.purchase_price end as purchase_price,
               case when money then t.value end as value,
               case when money then t.value_on end as value_on,
               case when money then t.sold_price end as sold_price,
               case when money then t.sold_to end as sold_to,
               case when money then (select coalesce(jsonb_agg(to_jsonb(l) - 'truck_id' order by l.start_on), '[]')
                                     from truck_loans l where l.truck_id = t.id) end as loans,
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
    'settings', case when money then (select to_jsonb(s) - 'id' from fleet_settings s where id = 1) end,
    'money', money,
    'rank', my_rank()
  ) into result;
  return result;
end $$;
revoke all on function public.trucks_data() from public, anon;
grant execute on function public.trucks_data() to authenticated;

-- Managers: driver, office, everyday details, notes and maintenance
create or replace function public.set_truck_driver(p_truck uuid, p_driver uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare old text; new text;
begin
  if not can_see_trucks() then raise exception 'Only managers and up can change trucks.'; end if;
  select coalesce(d.first_name || ' ' || d.last_name, t.driver_note, 'no driver') into old
  from trucks t left join employees d on d.id = t.driver_id where t.id = p_truck;
  if not found then raise exception 'That truck isn''t on the sheet.'; end if;
  update trucks set driver_id = p_driver, driver_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now(), updated_by = my_id()
  where id = p_truck;
  select coalesce((select first_name || ' ' || last_name from employees where id = p_driver), nullif(trim(coalesce(p_note, '')), ''), 'no driver') into new;
  if old is distinct from new then
    insert into truck_log (truck_id, kind, text) values (p_truck, 'driver', old || ' → ' || new);
  end if;
end $$;
revoke all on function public.set_truck_driver(uuid, uuid, text) from public, anon;
grant execute on function public.set_truck_driver(uuid, uuid, text) to authenticated;

create or replace function public.move_truck(p_truck uuid, p_office text)
returns void language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not can_see_trucks() then raise exception 'Only managers and up can change trucks.'; end if;
  select office into old from trucks where id = p_truck;
  if not found then raise exception 'That truck isn''t on the sheet.'; end if;
  if old is not distinct from p_office then return; end if;
  update trucks set office = p_office, updated_at = now(), updated_by = my_id() where id = p_truck;
  insert into truck_log (truck_id, kind, text)
  values (p_truck, 'moved', coalesce((select name from offices where key = old), 'no office') || ' → ' || coalesce((select name from offices where key = p_office), 'no office'));
end $$;
revoke all on function public.move_truck(uuid, text) from public, anon;
grant execute on function public.move_truck(uuid, text) to authenticated;

create or replace function public.add_truck_log(p_truck uuid, p_kind text, p_day date, p_text text, p_cost numeric, p_miles integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not can_see_trucks() then raise exception 'Only managers and up can add notes.'; end if;
  if p_kind not in ('note', 'maintenance') then raise exception 'Pick note or maintenance.'; end if;
  if nullif(trim(coalesce(p_text, '')), '') is null then raise exception 'Write what happened first.'; end if;
  insert into truck_log (truck_id, kind, day, text, cost, miles)
  values (p_truck, p_kind, coalesce(p_day, (now() at time zone 'America/New_York')::date), trim(p_text), p_cost, p_miles)
  returning id into v;
  if p_miles is not null then
    update trucks set mileage = p_miles, mileage_on = coalesce(p_day, (now() at time zone 'America/New_York')::date)
    where id = p_truck and (mileage_on is null or mileage_on <= coalesce(p_day, (now() at time zone 'America/New_York')::date));
  end if;
  return v;
end $$;
revoke all on function public.add_truck_log(uuid, text, date, text, numeric, integer) from public, anon;
grant execute on function public.add_truck_log(uuid, text, date, text, numeric, integer) to authenticated;

create or replace function public.delete_truck_log(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (can_see_finance() or exists (select 1 from truck_log where id = p_id and by_id = my_id() and kind in ('note', 'maintenance'))) then
    raise exception 'Only the person who wrote it (or C-Suite) can delete it.';
  end if;
  delete from truck_log where id = p_id and kind in ('note', 'maintenance');
end $$;
revoke all on function public.delete_truck_log(uuid) from public, anon;
grant execute on function public.delete_truck_log(uuid) to authenticated;

-- Details. Managers change the everyday fields; money fields only with can_see_finance().
-- Adding (p_id null) is C-Suite only and logs 'added' (returns that log id for the email).
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
    if not money then raise exception 'Only C-Suite and the President can add trucks.'; end if;
    insert into trucks (vin, status) values (upper(replace(txt, ' ', '')), 'active') returning id into v;
    insert into truck_log (truck_id, kind, day, text)
    values (v, 'added', coalesce((p ->> 'bought_on')::date, (now() at time zone 'America/New_York')::date), 'Added to the fleet')
    returning id into ev;
  end if;
  update trucks set
    truck_no    = case when p ? 'truck_no' then nullif(trim(p ->> 'truck_no'), '') else truck_no end,
    vin         = case when p ? 'vin' and money then upper(replace(txt, ' ', '')) else vin end,
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
    mileage     = case when p ? 'mileage' then nullif(p ->> 'mileage', '')::integer else mileage end,
    mileage_on  = case when p ? 'mileage' and nullif(p ->> 'mileage', '') is not null then (now() at time zone 'America/New_York')::date else mileage_on end,
    notes       = case when p ? 'notes' then nullif(trim(p ->> 'notes'), '') else notes end,
    office      = case when p_id is null and p ? 'office' then nullif(p ->> 'office', '') else office end,
    insurance_yearly = case when money and p ? 'insurance_yearly' then nullif(p ->> 'insurance_yearly', '')::numeric else insurance_yearly end,
    bought_on      = case when money and p ? 'bought_on' then nullif(p ->> 'bought_on', '')::date else bought_on end,
    purchase_price = case when money and p ? 'purchase_price' then nullif(p ->> 'purchase_price', '')::numeric else purchase_price end,
    value          = case when money and p ? 'value' then nullif(p ->> 'value', '')::numeric else value end,
    value_on       = case when money and p ? 'value' and nullif(p ->> 'value', '') is not null then coalesce(nullif(p ->> 'value_on', '')::date, (now() at time zone 'America/New_York')::date) else value_on end,
    updated_at = now(), updated_by = my_id()
  where id = v;
  return jsonb_build_object('id', v, 'event', ev);
end $$;
revoke all on function public.save_truck(uuid, jsonb) from public, anon;
grant execute on function public.save_truck(uuid, jsonb) to authenticated;

-- The loan on a truck (C-Suite). p_loan null = new; p_delete removes it.
create or replace function public.save_truck_loan(p_truck uuid, p_loan uuid, p jsonb, p_delete boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_see_finance() then raise exception 'Only C-Suite and the President can change loans.'; end if;
  if p_delete then delete from truck_loans where id = p_loan and truck_id = p_truck; return; end if;
  if p_loan is null then insert into truck_loans (truck_id) values (p_truck) returning id into p_loan; end if;
  update truck_loans set
    lender     = nullif(trim(p ->> 'lender'), ''),
    payment    = nullif(p ->> 'payment', '')::numeric,
    start_on   = nullif(p ->> 'start_on', '')::date,
    end_on     = nullif(p ->> 'end_on', '')::date,
    financed   = nullif(p ->> 'financed', '')::numeric,
    rate       = nullif(p ->> 'rate', '')::numeric,
    balance    = nullif(p ->> 'balance', '')::numeric,
    balance_on = coalesce(nullif(p ->> 'balance_on', '')::date, (now() at time zone 'America/New_York')::date),
    paid_off   = coalesce((p ->> 'paid_off')::boolean, false),
    notes      = nullif(trim(p ->> 'notes'), ''),
    updated_at = now()
  where id = p_loan and truck_id = p_truck;
end $$;
revoke all on function public.save_truck_loan(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_truck_loan(uuid, uuid, jsonb, boolean) to authenticated;

-- For sale (switch), sold / gone (drops off the sheet, logs 'removed' for the email), or back on the sheet.
create or replace function public.set_truck_status(p_truck uuid, p_status text, p_day date, p_price numeric, p_to text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare old text; ev uuid; d date := coalesce(p_day, (now() at time zone 'America/New_York')::date);
begin
  if not can_see_finance() then raise exception 'Only C-Suite and the President can sell or remove trucks.'; end if;
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

create or replace function public.set_fleet_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_see_finance() then raise exception 'Only C-Suite and the President can change this.'; end if;
  update fleet_settings set
    insurance_name   = nullif(trim(p ->> 'insurance_name'), ''),
    insurance_email  = nullif(lower(trim(p ->> 'insurance_email')), ''),
    bookkeeper_name  = nullif(trim(p ->> 'bookkeeper_name'), ''),
    bookkeeper_email = nullif(lower(trim(p ->> 'bookkeeper_email')), ''),
    reply_to         = nullif(lower(trim(p ->> 'reply_to')), '')
  where id = 1;
end $$;
revoke all on function public.set_fleet_settings(jsonb) from public, anon;
grant execute on function public.set_fleet_settings(jsonb) to authenticated;

commit;

-- Check
select 'truck sheet' as what, case when to_regclass('public.trucks') is not null then 'ready' else 'missing' end as detail
union all
select 'insurance agent', coalesce(insurance_name || ' <' || insurance_email || '>', '(not set)') from public.fleet_settings where id = 1
union all
select 'bookkeeper', coalesce(bookkeeper_name || ' <' || bookkeeper_email || '>', '(no email yet: add it in Operations → Trucks)') from public.fleet_settings where id = 1;
