-- 86 (2026-11-22). Each place's inventory manager and BWI account (John): the person who counts that place's inventory
-- and places its orders with BWI on its account number.
--   Atlanta West (Marietta): Branden Logan, EPRO725    Atlanta East: Lisa Schaal, EPRO726
--   Dallas: KC Todd, EPRO727                      Atlanta South: Oscar Ayala, EPRO728
--  * inventory_locations.manager_id. The month-end count reminder (change 85) goes to that person (region branch
--    managers if none set). A place's manager can open Inventory whatever their level.
--  * inventory_locations.wildlife_manager_id: who runs the Wildlife materials kept there, counts them, orders them and
--    sets their prices. West: Bryan Koons (Jessica Bowles keeps the wildlife office work). Wildlife's reminder goes to
--    him (the wildlife manager if none set).
--  * inventory_items.order_url: where to reorder it (most wildlife materials aren't from BWI, e.g. Amazon).
--  * Changed on Operations → Inventory → Dashboard → Places that keep inventory (C-Suite).
-- Safe to run twice. Stops without changing anything if one of the five names isn't found.

begin;

alter table public.inventory_locations add column if not exists manager_id uuid references public.employees(id);
alter table public.inventory_locations add column if not exists wildlife_manager_id uuid references public.employees(id);
alter table public.inventory_items add column if not exists order_url text;

do $$
declare
  want text[][] := array[['west', 'Branden', 'Logan', 'EPRO725'], ['east', 'Lisa', 'Schaal', 'EPRO726'],
                         ['dallas', 'KC', 'Todd', 'EPRO727'], ['south', 'Oscar', 'Ayala', 'EPRO728']];
  i int; v uuid; k int;
begin
  for i in 1 .. array_length(want, 1) loop
    select count(*) into k from employees where active and lower(first_name) = lower(want[i][2]) and lower(last_name) = lower(want[i][3]);
    if k <> 1 then raise exception 'Found % active people named % % (need exactly 1). Nothing was changed.', k, want[i][2], want[i][3]; end if;
    select id into v from employees where active and lower(first_name) = lower(want[i][2]) and lower(last_name) = lower(want[i][3]);
    update inventory_locations set manager_id = v, bwi_account = want[i][4] where key = want[i][1];
  end loop;
  select count(*) into k from employees where active and lower(first_name) in ('bryan', 'brian') and lower(last_name) = 'koons';
  if k <> 1 then raise exception 'Found % active people named Bryan Koons (need exactly 1). Nothing was changed.', k; end if;
  update inventory_locations set wildlife_manager_id = (select id from employees where active and lower(first_name) in ('bryan', 'brian') and lower(last_name) = 'koons')
   where key = 'west';
end $$;

-- A place's inventory manager sees everything in Inventory too
create or replace function public.inventory_scope()
returns text language sql stable security definer set search_path = public as $$
  select case
    when e.department::text <> 'wildlife' and level_rank(e.level) >= 3 then 'all'
    when exists (select 1 from inventory_locations l where l.manager_id = e.id and l.active) then 'all'
    when e.manages_wildlife or (e.department::text = 'wildlife' and level_rank(e.level) >= 2)
      or exists (select 1 from inventory_locations l where l.wildlife_manager_id = e.id and l.active) then 'wildlife'
  end
  from employees e where e.id = my_id() and e.active
$$;

-- The wildlife inventory manager sets wildlife prices too
create or replace function public.can_price_inventory(p_section text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e where e.id = my_id() and e.active and (
    level_rank(e.level) >= 4
    or (p_section = 'wildlife' and (e.manages_wildlife or (e.department::text = 'wildlife' and level_rank(e.level) >= 2)
        or exists (select 1 from inventory_locations l where l.wildlife_manager_id = e.id and l.active)))))
$$;

-- Each place's manager by name, and (C-Suite) the team to pick from
create or replace function public.inventory_places()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when inventory_scope() is not null then jsonb_build_object(
    'places', (select coalesce(jsonb_agg(jsonb_build_object('key', l.key,
        'manager', case when m.id is not null then m.first_name || ' ' || m.last_name end,
        'wildlife_manager', case when w.id is not null then w.first_name || ' ' || w.last_name end) order by l.sort), '[]')
       from inventory_locations l left join employees m on m.id = l.manager_id left join employees w on w.id = l.wildlife_manager_id),
    'people', case when coalesce(my_rank() >= 4, false) then
      (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name, 'office', e.office) order by e.first_name, e.last_name), '[]')
       from employees e where e.active) end) end
$$;
revoke all on function public.inventory_places() from public, anon;
grant execute on function public.inventory_places() to authenticated;

create or replace function public.save_inventory_location(p_key text, p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare k text := lower(regexp_replace(coalesce(p_key, p->>'name', ''), '[^a-zA-Z0-9]+', '_', 'g'));
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite can change places.'; end if;
  if k = '' or nullif(trim(coalesce(p->>'name', '')), '') is null then raise exception 'Give the place a name.'; end if;
  if nullif(p->>'office', '') is not null and not exists (select 1 from offices where key = p->>'office') then raise exception 'Unknown region.'; end if;
  if nullif(p->>'manager_id', '') is not null and not exists (select 1 from employees where id = (p->>'manager_id')::uuid and active) then raise exception 'Pick someone on the team.'; end if;
  if nullif(p->>'wildlife_manager_id', '') is not null and not exists (select 1 from employees where id = (p->>'wildlife_manager_id')::uuid and active) then raise exception 'Pick someone on the team.'; end if;
  insert into inventory_locations (key, name, office, bwi_account, has_wildlife, sort, active, manager_id, wildlife_manager_id)
  values (k, trim(p->>'name'), nullif(p->>'office', ''), nullif(upper(trim(coalesce(p->>'bwi_account', ''))), ''),
          coalesce((p->>'has_wildlife')::boolean, false), coalesce(nullif(p->>'sort', '')::integer, 100), coalesce((p->>'active')::boolean, true),
          nullif(p->>'manager_id', '')::uuid, nullif(p->>'wildlife_manager_id', '')::uuid)
  on conflict (key) do update set name = excluded.name, office = excluded.office, bwi_account = excluded.bwi_account,
    has_wildlife = excluded.has_wildlife, active = excluded.active, manager_id = excluded.manager_id,
    wildlife_manager_id = excluded.wildlife_manager_id;
  return k;
end $$;

-- Where to reorder an item (anyone who can price its section)
create or replace function public.set_inventory_order_url(p_item uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare sec text;
begin
  select section into sec from inventory_items where id = p_item;
  if sec is null or not can_price_inventory(sec) then raise exception 'You can’t change that item.'; end if;
  if nullif(trim(coalesce(p_url, '')), '') is not null and trim(p_url) !~* '^https?://' then raise exception 'Paste the full link (starting with https://).'; end if;
  update inventory_items set order_url = nullif(trim(coalesce(p_url, '')), '') where id = p_item;
end $$;
revoke all on function public.set_inventory_order_url(uuid, text) from public, anon;
grant execute on function public.set_inventory_order_url(uuid, text) to authenticated;

commit;
notify pgrst, 'reload schema';
