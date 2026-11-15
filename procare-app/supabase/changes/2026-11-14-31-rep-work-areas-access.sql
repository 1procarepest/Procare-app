-- 2026-11-14. Rep work areas for everyone in sales and all leadership (lead and up, any department).
-- Only service and office team members don't see it.
create or replace function public.can_see_rep_areas()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees e
                 where e.id = my_id() and e.active and (e.department = 'sales' or e.level <> 'team_member'))
$$;
revoke all on function public.can_see_rep_areas() from public, anon;
grant execute on function public.can_see_rep_areas() to authenticated;
