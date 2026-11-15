-- Row level security rules and triggers for the pay plan tables (change 2026-11-15-32).
-- Everyone signed in can read settings and service groups (the pay calculator uses them);
-- reps read only their own plan. can_manage_pay() (sales managers, C-Suite, President) edits everything.
-- Every change is logged.

alter table public.comp_settings enable row level security;
alter table public.comp_service_groups enable row level security;
alter table public.comp_assignments enable row level security;
drop policy if exists comp_settings_read on public.comp_settings;
create policy comp_settings_read on public.comp_settings for select to authenticated using (my_id() is not null);
drop policy if exists comp_settings_write on public.comp_settings;
create policy comp_settings_write on public.comp_settings for update to authenticated using (can_manage_pay()) with check (can_manage_pay());
drop policy if exists comp_groups_read on public.comp_service_groups;
create policy comp_groups_read on public.comp_service_groups for select to authenticated using (my_id() is not null);
drop policy if exists comp_groups_write on public.comp_service_groups;
create policy comp_groups_write on public.comp_service_groups for all to authenticated using (can_manage_pay()) with check (can_manage_pay());
drop policy if exists comp_assignments_read on public.comp_assignments;
create policy comp_assignments_read on public.comp_assignments for select to authenticated using (employee_id = my_id() or can_manage_pay());
drop policy if exists comp_assignments_write on public.comp_assignments;
create policy comp_assignments_write on public.comp_assignments for all to authenticated
  using (can_manage_pay())
  with check (can_manage_pay() and exists (select 1 from employees e where e.id = employee_id and e.department = 'sales'));  -- change 33: sales reps only
drop trigger if exists log_comp_settings on public.comp_settings;
create trigger log_comp_settings after insert or delete or update on public.comp_settings for each row execute function log_change();
drop trigger if exists log_comp_service_groups on public.comp_service_groups;
create trigger log_comp_service_groups after insert or delete or update on public.comp_service_groups for each row execute function log_change();
drop trigger if exists log_comp_assignments on public.comp_assignments;
create trigger log_comp_assignments after insert or delete or update on public.comp_assignments for each row execute function log_change();
