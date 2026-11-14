-- 2026-11-14. Today's route: show FieldRoutes' time window (AT for anytime jobs) and keep the route's order.
-- After running this and pasting the new script, run refreshTodayRoutes in Procare Sync once more.

begin;

alter table public.fr_appointments
  add column if not exists time_window text,      -- FieldRoutes timeWindow (e.g. AT = anytime)
  add column if not exists sequence integer;      -- the job's place on its route

-- A tech's route for a day. The tech comes from the job's route (or its assigned tech), never from
-- the appointment's employeeID, which is whoever booked it.
-- A tech's route for a day (default: the signed-in person, today). Their own, or someone they manage.
-- Upsells: GPS if no general pest; TBS unless they have TBS or TL; MOS unless they have MOS or MOSG.
drop function if exists public.my_route(uuid, date);
create function public.my_route(p_employee uuid default null, p_day date default null)
returns table (appointment_id bigint, start_time time, end_time time, time_window text, route_order integer, done boolean, customer text, service text,
               autopay boolean, has_notes boolean, upsell text[])
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := my_id();
  target uuid := coalesce(p_employee, my_id());
  day date := coalesce(p_day, (now() at time zone 'America/New_York')::date);
  ids bigint[];
begin
  if me is null or target is null then return; end if;
  if target <> me and not can_manage(target) and my_rank() < 4 then return; end if;
  ids := tech_fr_ids(target);

  return query
  select a.appointment_id, a.start_time, a.end_time, a.time_window, a.sequence, (a.status = 1),
         coalesce(nullif(trim(c.company_name), ''), c.last_name, '(unknown)'),
         coalesce(t.description, ''),
         coalesce(c.autopay, '') !~* '^(no|0|false|none)?$',
         coalesce(a.has_notes, false),
         array_remove(array[
           case when not coalesce(h.gps, false) then 'GPS' end,
           case when not (coalesce(h.tbs, false) or coalesce(h.tl, false)) then 'TBS' end,
           case when not (coalesce(h.mos, false) or coalesce(h.mosg, false)) then 'MOS' end
         ], null)
  from fr_appointments a
  left join fr_routes rr on rr.route_id = a.route_id
  left join fr_customers c on c.customer_id = a.customer_id
  left join fr_service_types t on t.office = a.office and t.type_id = a.type_id
  left join lateral (
    select bool_or(service_code(s.service_type) = 'GPS') as gps, bool_or(service_code(s.service_type) = 'TBS') as tbs,
           bool_or(service_code(s.service_type) = 'TL') as tl, bool_or(service_code(s.service_type) = 'MOS') as mos,
           bool_or(service_code(s.service_type) = 'MOSG') as mosg
    from fr_subscriptions s where s.customer_id = a.customer_id and s.active
  ) h on true
  where a.date = day and coalesce(nullif(a.assigned_tech, 0), rr.assigned_tech) = any(ids)
    and coalesce(a.status, 0) <> -1 and coalesce(a.status_text, '') !~* '(cancel|resched)'
  order by a.sequence nulls last, a.start_time nulls last, a.appointment_id;
end $$;
revoke execute on function public.my_route(uuid, date) from public, anon;
grant execute on function public.my_route(uuid, date) to authenticated;

commit;
