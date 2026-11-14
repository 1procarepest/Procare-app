-- 2026-11-14. The email/phone lookup the app uses (employee_contacts) was missing from the database,
-- so emails never showed in People. This creates it. Safe to run more than once.
-- You always get your own email and phone; leads and up get everyone they can see.

create or replace function public.employee_contacts(target uuid default null)
returns table (id uuid, email text, phone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.email, e.phone
  from public.employees e
  where (target is null or e.id = target)
    and (
         e.id = public.my_id()
      or (public.my_rank() >= 2 and (e.active or public.can_manage(e.id)))
    )
$$;

revoke execute on function public.employee_contacts(uuid) from public, anon;
grant execute on function public.employee_contacts(uuid) to authenticated;

-- Check: how many emails the President's login gets (should be about the whole team).
select count(*) as emails_the_president_sees
from (select set_config('request.jwt.claims', json_build_object('sub',
        (select auth_user_id from public.employees where level = 'president' and active limit 1), 'role', 'authenticated')::text, true)) s,
     public.employee_contacts() c;
