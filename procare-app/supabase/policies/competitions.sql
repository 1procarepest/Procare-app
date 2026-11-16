-- Row level security rules and triggers for the competition tables (change 2026-11-15-39).
-- Everyone signed in reads them. can_run_competition(): managers for their own department, C-Suite and the
-- President for any. can_edit_competition(): the creator (if still allowed) or C-Suite / President. Every change is logged.

alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;

drop policy if exists competitions_read on public.competitions;
create policy competitions_read on public.competitions for select to authenticated using (my_id() is not null);
drop policy if exists competitions_add on public.competitions;
create policy competitions_add on public.competitions for insert to authenticated
  with check (can_run_competition(departments) and created_by = my_id());
drop policy if exists competitions_change on public.competitions;
create policy competitions_change on public.competitions for update to authenticated
  using (can_edit_competition(id)) with check (can_run_competition(departments));
drop policy if exists competitions_remove on public.competitions;
create policy competitions_remove on public.competitions for delete to authenticated using (can_edit_competition(id));

drop policy if exists competition_members_read on public.competition_members;
create policy competition_members_read on public.competition_members for select to authenticated using (my_id() is not null);
drop policy if exists competition_members_write on public.competition_members;
create policy competition_members_write on public.competition_members for all to authenticated
  using (can_edit_competition(competition_id))
  with check (can_edit_competition(competition_id) and exists (
    select 1 from employees e join competitions c on c.id = competition_id
    where e.id = employee_id and e.department::text = any (c.departments)));

drop trigger if exists log_competitions on public.competitions;
create trigger log_competitions after insert or delete or update on public.competitions for each row execute function log_change();
drop trigger if exists log_competition_members on public.competition_members;
create trigger log_competition_members after insert or delete or update on public.competition_members for each row execute function log_change();
