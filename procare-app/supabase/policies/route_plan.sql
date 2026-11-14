-- Row level security rules and triggers for the route plan tables (change 2026-11-14-28).
-- can_see_ops() people can read and change all of it. Every change is logged.

alter table public.route_plan_usual  enable row level security;
alter table public.route_plan_days   enable row level security;
alter table public.route_plan_builds enable row level security;

drop policy if exists route_plan_usual_all on public.route_plan_usual;
create policy route_plan_usual_all on public.route_plan_usual
  for all to authenticated using (can_see_ops()) with check (can_see_ops());
drop policy if exists route_plan_days_all on public.route_plan_days;
create policy route_plan_days_all on public.route_plan_days
  for all to authenticated using (can_see_ops()) with check (can_see_ops());
drop policy if exists route_plan_builds_all on public.route_plan_builds;
create policy route_plan_builds_all on public.route_plan_builds
  for all to authenticated using (can_see_ops()) with check (can_see_ops());

drop trigger if exists log_route_plan_usual on public.route_plan_usual;
create trigger log_route_plan_usual after insert or delete or update on public.route_plan_usual
  for each row execute function log_change();
