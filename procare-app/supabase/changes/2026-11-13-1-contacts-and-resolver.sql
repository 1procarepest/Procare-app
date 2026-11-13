-- Step 1 of 2 (2026-11-13). Safe to run before the app update: adds things, removes nothing.
--
-- 1. employee_contacts(): email and phone lookup. You always get your own;
--    leads and up get everyone they can see. Team members get only their own.
-- 2. Schedule issues record who resolved them (resolved_by), set by the database.
-- 3. Fills in resolved_by for issues already resolved, from the activity log.

begin;

-- 1. Contact lookup ------------------------------------------------------------

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

-- 2. Who resolved a schedule issue ---------------------------------------------

create or replace function public.guard_issue()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_by := coalesce(public.my_id(), new.resolved_by);
    new.resolved_at := now();
  elsif new.status = 'open' then
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists issues_guard on public.schedule_issue_reports;
create trigger issues_guard
  before update on public.schedule_issue_reports
  for each row execute function guard_issue();

-- 3. Fill in issues resolved before today's change -----------------------------

update public.schedule_issue_reports r
set resolved_by = (
  select l.actor_id
  from public.activity_log l
  where l.table_name = 'schedule_issue_reports'
    and l.record_id = r.id::text
    and l.action = 'update'
    and l.after ->> 'status' = 'resolved'
  order by l.created_at
  limit 1
)
where r.status = 'resolved' and r.resolved_by is null;

commit;
