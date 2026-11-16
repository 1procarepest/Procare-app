-- Row level security for office_kpi_days (change 2026-11-15-42). Only Operations people read it directly;
-- competitions read it through office_kpi_board(), which returns rates only. Written by save_office_kpis().
alter table public.office_kpi_days enable row level security;
drop policy if exists office_kpi_days_read on public.office_kpi_days;
create policy office_kpi_days_read on public.office_kpi_days for select to authenticated using (can_see_ops());
