-- 2026-11-13. Procare Sync keeps the team list in step with FieldRoutes.
--   New hires (active in FieldRoutes, not in the app) are added as team members.
--   People who are inactive in FieldRoutes everywhere are deactivated (deactivated_by = 'sync'),
--   and reactivated if FieldRoutes turns them back on.
--   Anyone deactivated by a person in the app (deactivated_by = 'person') is never turned back on.

begin;

alter table public.employees add column if not exists deactivated_by text;
alter table public.employees drop constraint if exists employees_deactivated_by_check;
alter table public.employees add constraint employees_deactivated_by_check check (deactivated_by in ('sync', 'person'));

-- People already switched off were switched off by hand.
update public.employees set deactivated_by = 'person' where not active and deactivated_by is null;

-- Records who deactivated someone. Procare Sync sends deactivated_by = 'sync' itself; any other
-- deactivation (the app, or the SQL editor) counts as a person's decision. Reactivating clears it.
create or replace function public.track_deactivation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.active is distinct from old.active then
    if new.active then
      new.deactivated_by := null;
    elsif new.deactivated_by is distinct from 'sync' or auth.uid() is not null then
      new.deactivated_by := 'person';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists employees_track_deactivation on public.employees;
create trigger employees_track_deactivation
  before update on public.employees
  for each row execute function public.track_deactivation();

-- The person page shows whether FieldRoutes or a person deactivated someone.
grant select (deactivated_by) on public.employees to authenticated;

commit;
