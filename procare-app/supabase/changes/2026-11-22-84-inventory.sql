-- 84 (2026-11-22). Inventory (John): the "Inventory Now" Google Sheet as part of the app.
--  * inventory_locations: every place that gets deliveries and keeps product. East, West, South and Dallas to start;
--    satellites are added later and tied to their region (office). Wildlife keeps its materials at West, so Wildlife
--    is a section of the West count, not a place of its own. bwi_account: the BWI customer number (EPRO725…) that
--    ships to the location.
--  * inventory_items: one list with one price. section: pest or wildlife. kind: product, tbs (termite baiting),
--    equipment (counted working / needs repair / strip for parts), promo, uniform (counted by size).
--    price = what one counted unit is worth. pack_qty / pack_price: for boxes of small parts (screws, anchors…), the
--    price of the box and how many are in it; the app works out the price of one. list_price: BWI's latest price list;
--    expo_price: the price locked in at the BWI Expo, for one counted unit.
--  * inventory_prices: every price change (prices change every year).
--  * inventory_counts + inventory_count_lines: the monthly count, per location, month and section. Prices are copied
--    onto the lines when saved, so old months keep their value when a price changes.
--  * inventory_history: monthly totals from the sheet's 2026 Dashboard, for the months before the app.
--  * bwi_shows + bwi_commitments: what was committed at the BWI Expo (locked prices, delivery dates, bonus bucks),
--    what's been delivered, and paying it off by the pay-by date (June).
--  Who: managers and up (not the wildlife department) count and see everything; the wildlife department's leads and
--  up, and the wildlife manager (Jessica), count and price the Wildlife section. C-Suite sets pest prices, places and
--  the BWI accounts.
-- Safe to run twice.

begin;

create table if not exists public.inventory_locations (
  key         text primary key,
  name        text not null,
  office      text references public.offices(key),
  bwi_account text,
  has_wildlife boolean not null default false,
  sort        integer not null default 100,
  active      boolean not null default true
);
insert into public.inventory_locations (key, name, office, has_wildlife, sort) values
  ('east', 'Atlanta East', 'east', false, 1),
  ('west', 'Atlanta West (Marietta)', 'west', true, 2),
  ('south', 'Atlanta South', 'south', false, 3),
  ('dallas', 'Dallas', 'west', false, 4)
on conflict (key) do nothing;

create table if not exists public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  section     text not null default 'pest' check (section in ('pest', 'wildlife')),
  category    text not null,
  kind        text not null default 'product' check (kind in ('product', 'tbs', 'equipment', 'promo', 'uniform')),
  name        text not null,
  unit        text,
  price       numeric(12,4),
  price_on    date,
  price_source text,
  pack_qty    numeric(12,2),
  pack_price  numeric(12,2),
  vendor      text,
  item_no     text,
  pack_size   text,
  list_price  numeric(12,4),
  list_unit   text,
  list_on     date,
  expo_price  numeric(12,4),
  expo_year   integer,
  sort        integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (section, name)
);
create index if not exists inventory_items_item_no on public.inventory_items (item_no);

create table if not exists public.inventory_prices (
  id       uuid primary key default gen_random_uuid(),
  item_id  uuid not null references public.inventory_items(id) on delete cascade,
  price    numeric(12,4),
  day      date not null default (now() at time zone 'America/New_York')::date,
  source   text,
  by_id    uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index if not exists inventory_prices_item on public.inventory_prices (item_id, created_at);

create table if not exists public.inventory_counts (
  id          uuid primary key default gen_random_uuid(),
  location    text not null references public.inventory_locations(key),
  month       date not null check (extract(day from month) = 1),
  section     text not null default 'pest' check (section in ('pest', 'wildlife')),
  status      text not null default 'draft' check (status in ('draft', 'done')),
  counted_by  uuid references public.employees(id),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz,
  source      text,
  unique (location, month, section)
);

create table if not exists public.inventory_count_lines (
  count_id  uuid not null references public.inventory_counts(id) on delete cascade,
  item_id   uuid not null references public.inventory_items(id) on delete cascade,
  qty       numeric(12,2),
  repair    numeric(12,2),
  parts     numeric(12,2),
  sizes     jsonb,
  price     numeric(12,4),
  primary key (count_id, item_id)
);

create table if not exists public.inventory_history (
  location text not null references public.inventory_locations(key),
  month    date not null,
  section  text not null default 'pest',
  total    numeric(12,2),
  tbs      numeric(12,2),
  primary key (location, month, section)
);

create table if not exists public.bwi_shows (
  year       integer primary key,
  name       text not null,
  start_on   date,
  end_on     date,
  pay_by     date,
  paid       numeric(12,2) not null default 0,
  paid_on    date,
  notes      text
);

create table if not exists public.bwi_commitments (
  id          uuid primary key default gen_random_uuid(),
  show_year   integer not null references public.bwi_shows(year) on delete cascade,
  account     text not null,
  vendor      text,
  item_no     text,
  item_id     uuid references public.inventory_items(id) on delete set null,
  description text not null,
  deliver_on  date,
  deliver_by  date,
  price       numeric(12,2) not null,
  qty         numeric(12,2) not null,
  bonus       numeric(12,2) not null default 0,
  spiff       numeric(12,2) not null default 0,
  total       numeric(12,2) not null,
  received    numeric(12,2) not null default 0,
  note        text,
  unique (show_year, account, item_no)
);

-- BWI's prices by their item number: the price list they send (per each/stock unit) and the Expo's locked prices
create table if not exists public.bwi_prices (
  item_no     text primary key,
  description text not null,
  pack_size   text,
  uom         text,
  price       numeric(12,4),
  price_on    date,
  source      text
);

alter table public.bwi_prices enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_prices enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.inventory_history enable row level security;
alter table public.bwi_shows enable row level security;
alter table public.bwi_commitments enable row level security;
revoke all on public.bwi_prices, public.inventory_locations, public.inventory_items, public.inventory_prices, public.inventory_counts,
  public.inventory_count_lines, public.inventory_history, public.bwi_shows, public.bwi_commitments from anon, authenticated;

drop trigger if exists log_inventory_items on public.inventory_items;
create trigger log_inventory_items after insert or delete or update on public.inventory_items for each row execute function log_change();
drop trigger if exists log_bwi_shows on public.bwi_shows;
create trigger log_bwi_shows after insert or delete or update on public.bwi_shows for each row execute function log_change();

-- ---------- Who ----------
-- 'all': managers and up outside wildlife (everything). 'wildlife': the wildlife section only. null: nothing.
create or replace function public.inventory_scope()
returns text language sql stable security definer set search_path = public as $$
  select case
    when e.department::text <> 'wildlife' and level_rank(e.level) >= 3 then 'all'
    when e.manages_wildlife or (e.department::text = 'wildlife' and level_rank(e.level) >= 2) then 'wildlife'
  end
  from employees e where e.id = my_id() and e.active
$$;
revoke all on function public.inventory_scope() from public, anon;
grant execute on function public.inventory_scope() to authenticated;

-- Who can change prices for a section: C-Suite for pest; for wildlife also the wildlife manager and wildlife leads and up
create or replace function public.can_price_inventory(p_section text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e where e.id = my_id() and e.active and (
    level_rank(e.level) >= 4
    or (p_section = 'wildlife' and (e.manages_wildlife or (e.department::text = 'wildlife' and level_rank(e.level) >= 2)))))
$$;
revoke all on function public.can_price_inventory(text) from public, anon;
grant execute on function public.can_price_inventory(text) to authenticated;

-- ---------- The page ----------
-- p_month: the month being counted (any day in it). Returns the places, the items, every count this year and last
-- (with lines for this month and the latest count before it), the sheet's history and (scope 'all') the BWI Expo.
create or replace function public.inventory_data(p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  scope text := inventory_scope();
  m date := date_trunc('month', coalesce(p_month, (now() at time zone 'America/New_York')::date))::date;
  y0 date := (date_trunc('year', m) - interval '1 year')::date;
  result jsonb;
begin
  if scope is null then return null; end if;
  select jsonb_build_object(
    'scope', scope,
    'month', m,
    'can_price_pest', can_price_inventory('pest'),
    'can_price_wildlife', can_price_inventory('wildlife'),
    'can_admin', coalesce(my_rank() >= 4, false),
    'locations', (select coalesce(jsonb_agg(to_jsonb(l) order by l.sort, l.name), '[]') from inventory_locations l
                   where l.active and (scope = 'all' or l.has_wildlife)),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.section, i.sort, i.category, i.name), '[]') from inventory_items i
               where (scope = 'all' or i.section = 'wildlife')),
    -- Every count since the start of last year (no lines): the dashboard
    'counts', (select coalesce(jsonb_agg(x order by x.month, x.location), '[]') from (
        select c.id, c.location, c.month, c.section, c.status, c.updated_at, c.done_at, c.source,
               b.first_name || ' ' || b.last_name as counted_by,
               (select coalesce(sum(coalesce(n.qty, 0) * coalesce(n.price, 0)) filter (where i.kind in ('product', 'tbs', 'promo')), 0)
                  from inventory_count_lines n join inventory_items i on i.id = n.item_id where n.count_id = c.id) as total,
               (select coalesce(sum(coalesce(n.qty, 0) * coalesce(n.price, 0)) filter (where i.kind = 'tbs'), 0)
                  from inventory_count_lines n join inventory_items i on i.id = n.item_id where n.count_id = c.id) as tbs,
               (select coalesce(sum(coalesce(n.qty, 0) * coalesce(n.price, 0)) filter (where i.kind = 'equipment'), 0)
                  from inventory_count_lines n join inventory_items i on i.id = n.item_id where n.count_id = c.id) as equipment
        from inventory_counts c left join employees b on b.id = c.counted_by
        where c.month >= y0 and (scope = 'all' or c.section = 'wildlife')) x),
    -- Lines for this month's counts and, per place and section, the latest count before this month
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('count_id', n.count_id, 'item_id', n.item_id, 'qty', n.qty, 'repair', n.repair,
                 'parts', n.parts, 'sizes', n.sizes, 'price', n.price)), '[]')
               from inventory_count_lines n join inventory_counts c on c.id = n.count_id
               where (scope = 'all' or c.section = 'wildlife')
                 and (c.month = m or c.id in (
                   select distinct on (c2.location, c2.section) c2.id from inventory_counts c2
                   where c2.month < m order by c2.location, c2.section, c2.month desc))),
    'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.month), '[]') from inventory_history h
                 where h.month >= y0 and (scope = 'all' or h.section = 'wildlife')),
    'bwi', case when scope = 'all' then jsonb_build_object(
        'shows', (select coalesce(jsonb_agg(to_jsonb(s) order by s.year desc), '[]') from bwi_shows s),
        'prices', (select coalesce(jsonb_agg(to_jsonb(p) order by p.description), '[]') from bwi_prices p),
        'commitments', (select coalesce(jsonb_agg(to_jsonb(c) order by c.account, c.deliver_on, c.description), '[]') from bwi_commitments c
                         where c.show_year = (select max(year) from bwi_shows)))
      end
  ) into result;
  return result;
end $$;
revoke all on function public.inventory_data(date) from public, anon;
grant execute on function public.inventory_data(date) to authenticated;

-- ---------- Counting ----------
-- p_lines: [{item, qty, repair, parts, sizes}]. Lines not sent are left as they were; send qty null to clear one.
create or replace function public.save_inventory_count(p_location text, p_month date, p_section text, p_lines jsonb, p_done boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  scope text := inventory_scope();
  m date := date_trunc('month', p_month)::date;
  v uuid;
  l jsonb;
  it inventory_items%rowtype;
  szs jsonb;
  q numeric;
begin
  if scope is null or (scope = 'wildlife' and p_section <> 'wildlife') then raise exception 'You can’t count that section.'; end if;
  if p_section not in ('pest', 'wildlife') then raise exception 'Unknown section.'; end if;
  if not exists (select 1 from inventory_locations where key = p_location and active and (p_section = 'pest' or has_wildlife)) then
    raise exception 'Pick a place.';
  end if;
  if m > date_trunc('month', (now() at time zone 'America/New_York')::date + 7)::date then raise exception 'That month hasn’t started.'; end if;
  insert into inventory_counts (location, month, section, counted_by, updated_at)
  values (p_location, m, p_section, my_id(), now())
  on conflict (location, month, section) do update set counted_by = my_id(), updated_at = now()
  returning id into v;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select * into it from inventory_items where id = (l->>'item')::uuid and section = p_section;
    if not found then continue; end if;
    szs := case when jsonb_typeof(l->'sizes') = 'object' then l->'sizes' end;
    q := case when szs is not null then (select sum(nullif(value, '')::numeric) from jsonb_each_text(szs)) else nullif(l->>'qty', '')::numeric end;
    if q is null and nullif(l->>'repair', '') is null and nullif(l->>'parts', '') is null then
      delete from inventory_count_lines where count_id = v and item_id = it.id;
      continue;
    end if;
    if q < 0 or nullif(l->>'repair', '')::numeric < 0 or nullif(l->>'parts', '')::numeric < 0 then raise exception 'Counts can’t be negative (%).', it.name; end if;
    insert into inventory_count_lines (count_id, item_id, qty, repair, parts, sizes, price)
    values (v, it.id, q, nullif(l->>'repair', '')::numeric, nullif(l->>'parts', '')::numeric, szs, it.price)
    on conflict (count_id, item_id) do update set qty = excluded.qty, repair = excluded.repair, parts = excluded.parts,
      sizes = excluded.sizes, price = excluded.price;
  end loop;
  if p_done then
    update inventory_counts set status = 'done', done_at = coalesce(done_at, now()) where id = v;
  elsif p_done is false then
    update inventory_counts set status = 'draft', done_at = null where id = v;
  end if;
  return v;
end $$;
revoke all on function public.save_inventory_count(text, date, text, jsonb, boolean) from public, anon;
grant execute on function public.save_inventory_count(text, date, text, jsonb, boolean) to authenticated;

-- ---------- Items and prices ----------
create or replace function public.save_inventory_item(p_id uuid, p jsonb, p_delete boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  old inventory_items%rowtype;
  sec text := coalesce(p->>'section', 'pest');
  v uuid := p_id;
  new_price numeric;
  pq numeric := nullif(regexp_replace(coalesce(p->>'pack_qty', ''), '[,\s]', '', 'g'), '')::numeric;
  pp numeric := nullif(regexp_replace(coalesce(p->>'pack_price', ''), '[$,\s]', '', 'g'), '')::numeric;
begin
  if p_id is not null then
    select * into old from inventory_items where id = p_id;
    if not found then raise exception 'That item is gone.'; end if;
    if not can_price_inventory(old.section) then raise exception 'You can’t change those items.'; end if;
    if p_delete then
      if exists (select 1 from inventory_count_lines where item_id = p_id) then
        update inventory_items set active = false where id = p_id;   -- counted before: keep it for old months
      else
        delete from inventory_items where id = p_id;
      end if;
      return p_id;
    end if;
  end if;
  if not can_price_inventory(sec) then raise exception 'You can’t change those items.'; end if;
  if nullif(trim(coalesce(p->>'name', '')), '') is null then raise exception 'Give it a name.'; end if;
  if nullif(trim(coalesce(p->>'category', '')), '') is null then raise exception 'Pick a category.'; end if;
  new_price := case when pq > 0 and pp is not null then round(pp / pq, 4)
                    else nullif(regexp_replace(coalesce(p->>'price', ''), '[$,\s]', '', 'g'), '')::numeric end;
  if new_price < 0 then raise exception 'Prices can’t be negative.'; end if;
  if p_id is null then
    insert into inventory_items (section, category, kind, name, unit, price, price_on, price_source, pack_qty, pack_price, vendor, item_no, pack_size, sort)
    values (sec, trim(p->>'category'), coalesce(nullif(p->>'kind', ''), 'product'), trim(p->>'name'), nullif(trim(coalesce(p->>'unit', '')), ''),
            new_price, case when new_price is not null then (now() at time zone 'America/New_York')::date end, case when new_price is not null then coalesce(nullif(p->>'price_source', ''), 'typed') end,
            pq, pp, nullif(trim(coalesce(p->>'vendor', '')), ''), nullif(trim(coalesce(p->>'item_no', '')), ''), nullif(trim(coalesce(p->>'pack_size', '')), ''),
            coalesce(nullif(p->>'sort', '')::integer, 100))
    returning id into v;
    if new_price is not null then insert into inventory_prices (item_id, price, source, by_id) values (v, new_price, coalesce(nullif(p->>'price_source', ''), 'typed'), my_id()); end if;
  else
    update inventory_items set
      section = sec, category = trim(p->>'category'), kind = coalesce(nullif(p->>'kind', ''), kind), name = trim(p->>'name'),
      unit = nullif(trim(coalesce(p->>'unit', '')), ''), pack_qty = pq, pack_price = pp,
      vendor = nullif(trim(coalesce(p->>'vendor', '')), ''), item_no = nullif(trim(coalesce(p->>'item_no', '')), ''),
      pack_size = nullif(trim(coalesce(p->>'pack_size', '')), ''), active = coalesce((p->>'active')::boolean, active),
      price = new_price,
      price_on = case when new_price is distinct from old.price then (now() at time zone 'America/New_York')::date else price_on end,
      price_source = case when new_price is distinct from old.price then coalesce(nullif(p->>'price_source', ''), 'typed') else price_source end
    where id = p_id;
    if new_price is distinct from old.price then
      insert into inventory_prices (item_id, price, source, by_id) values (p_id, new_price, coalesce(nullif(p->>'price_source', ''), 'typed'), my_id());
    end if;
  end if;
  return v;
end $$;
revoke all on function public.save_inventory_item(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_inventory_item(uuid, jsonb, boolean) to authenticated;

create or replace function public.inventory_price_history(p_item uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from inventory_items i where i.id = p_item and (inventory_scope() = 'all' or (inventory_scope() = 'wildlife' and i.section = 'wildlife')))
    then (select coalesce(jsonb_agg(jsonb_build_object('price', h.price, 'day', h.day, 'source', h.source, 'by', b.first_name || ' ' || b.last_name) order by h.created_at desc), '[]')
          from inventory_prices h left join employees b on b.id = h.by_id where h.item_id = p_item) end
$$;
revoke all on function public.inventory_price_history(uuid) from public, anon;
grant execute on function public.inventory_price_history(uuid) to authenticated;

-- ---------- Places (C-Suite) ----------
create or replace function public.save_inventory_location(p_key text, p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare k text := lower(regexp_replace(coalesce(p_key, p->>'name', ''), '[^a-zA-Z0-9]+', '_', 'g'));
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite can change places.'; end if;
  if k = '' or nullif(trim(coalesce(p->>'name', '')), '') is null then raise exception 'Give the place a name.'; end if;
  if nullif(p->>'office', '') is not null and not exists (select 1 from offices where key = p->>'office') then raise exception 'Unknown region.'; end if;
  insert into inventory_locations (key, name, office, bwi_account, has_wildlife, sort, active)
  values (k, trim(p->>'name'), nullif(p->>'office', ''), nullif(upper(trim(coalesce(p->>'bwi_account', ''))), ''),
          coalesce((p->>'has_wildlife')::boolean, false), coalesce(nullif(p->>'sort', '')::integer, 100), coalesce((p->>'active')::boolean, true))
  on conflict (key) do update set name = excluded.name, office = excluded.office, bwi_account = excluded.bwi_account,
    has_wildlife = excluded.has_wildlife, active = excluded.active;
  return k;
end $$;
revoke all on function public.save_inventory_location(text, jsonb) from public, anon;
grant execute on function public.save_inventory_location(text, jsonb) to authenticated;

-- ---------- BWI Expo ----------
-- Managers and up mark what's come in; C-Suite sets the pay-by date and what's been paid.
create or replace function public.set_bwi_received(p_id uuid, p_received numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(inventory_scope(), '') <> 'all' then raise exception 'Only managers and up can mark deliveries.'; end if;
  if p_received is null or p_received < 0 then raise exception 'Type how many came in.'; end if;
  update bwi_commitments set received = p_received where id = p_id;
end $$;
revoke all on function public.set_bwi_received(uuid, numeric) from public, anon;
grant execute on function public.set_bwi_received(uuid, numeric) to authenticated;

create or replace function public.save_bwi_show(p_year integer, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite can change this.'; end if;
  update bwi_shows set
    pay_by = coalesce(nullif(p->>'pay_by', '')::date, pay_by),
    paid = coalesce(nullif(regexp_replace(coalesce(p->>'paid', ''), '[$,\s]', '', 'g'), '')::numeric, paid),
    paid_on = case when p ? 'paid' then (now() at time zone 'America/New_York')::date else paid_on end,
    notes = case when p ? 'notes' then nullif(trim(p->>'notes'), '') else notes end
  where year = p_year;
end $$;
revoke all on function public.save_bwi_show(integer, jsonb) from public, anon;
grant execute on function public.save_bwi_show(integer, jsonb) to authenticated;

commit;
notify pgrst, 'reload schema';
