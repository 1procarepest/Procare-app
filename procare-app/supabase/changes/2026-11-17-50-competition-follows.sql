-- 2026-11-17-50 competition follows: leaders see their department's live competitions on their profile even when
-- they aren't in them (decided with John, 2026-11-17).
-- Automatic (in the app, no data needed): the President sees every live competition; leads, managers and C-Suite see
-- live competitions for their own department in their own office (no office = every office).
-- competition_follows adds more for one person, set by C-Suite and the President on the person's page:
-- Ryan Boyd (Operations Manager) sees every office's technician and office competitions; Shelly sees East technician ones.

begin;

create table if not exists public.competition_follows (
  employee_id uuid not null references public.employees(id) on delete cascade,
  department  text not null check (department in ('technician', 'sales', 'administrative')),
  office      text references public.offices(key),   -- null = every office
  primary key (employee_id, department)
);

alter table public.competition_follows enable row level security;
drop policy if exists competition_follows_read on public.competition_follows;
create policy competition_follows_read on public.competition_follows for select to authenticated using (my_id() is not null);
drop policy if exists competition_follows_write on public.competition_follows;
create policy competition_follows_write on public.competition_follows for all to authenticated
  using (my_rank() >= 4) with check (my_rank() >= 4);

drop trigger if exists log_competition_follows on public.competition_follows;
create trigger log_competition_follows after insert or delete or update on public.competition_follows for each row execute function log_change();

-- Ryan Boyd: technician and office competitions in all three offices (not sales).
insert into public.competition_follows (employee_id, department, office)
select e.id, d, null from public.employees e cross join unnest(array['technician', 'administrative']) as d
where e.active and lower(e.first_name) = 'ryan' and lower(e.last_name) = 'boyd'
on conflict (employee_id, department) do update set office = excluded.office;

-- Shelly: Atlanta East technician competitions (only when exactly one active Shelly is found).
insert into public.competition_follows (employee_id, department, office)
select e.id, 'technician', 'east' from public.employees e
where e.active and lower(e.first_name) in ('shelly', 'shelley')
  and (select count(*) from public.employees x where x.active and lower(x.first_name) in ('shelly', 'shelley')) = 1
on conflict (employee_id, department) do update set office = excluded.office;

commit;

-- Check: every lead and up, and what they see besides their own competitions.
select e.first_name || ' ' || e.last_name as person, e.level, e.department, coalesce(e.office, 'every office') as office,
       coalesce((select string_agg(f.department || ' (' || coalesce(f.office, 'every office') || ')', ', ')
                 from public.competition_follows f where f.employee_id = e.id), '') as also_sees
from public.employees e
where e.active and (e.level <> 'team_member' or exists (select 1 from public.competition_follows f where f.employee_id = e.id))
order by e.level desc, e.department, e.office, e.first_name;
