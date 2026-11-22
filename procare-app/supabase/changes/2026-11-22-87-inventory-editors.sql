-- 87 (2026-11-22). Who keeps the item lists (John): each place's inventory manager can add, change and remove pest
-- items and their prices (Branden, Lisa, KC, Oscar), along with C-Suite. Wildlife stays with the wildlife inventory
-- manager (Bryan Koons), the wildlife manager and wildlife leads. Removing an item that was counted before hides it,
-- so old months keep their value.
-- Safe to run twice.
create or replace function public.can_price_inventory(p_section text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e where e.id = my_id() and e.active and (
    level_rank(e.level) >= 4
    or (p_section = 'pest' and exists (select 1 from inventory_locations l where l.manager_id = e.id and l.active))
    or (p_section = 'wildlife' and (e.manages_wildlife or (e.department::text = 'wildlife' and level_rank(e.level) >= 2)
        or exists (select 1 from inventory_locations l where l.wildlife_manager_id = e.id and l.active)))))
$$;
notify pgrst, 'reload schema';
