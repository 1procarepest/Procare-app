-- Row level security rules and triggers for public.company_holidays (change 57).
-- Reference copy. The app doesn't run this file. Helper functions are in ../functions.sql.

alter table public.company_holidays enable row level security;

-- Everyone can read the holiday switches; only C-Suite and the President can flip them.
create policy holidays_read on public.company_holidays
  for select to authenticated
  using (true);

create policy holidays_write on public.company_holidays
  for update to authenticated
  using (my_rank() >= 4)
  with check (my_rank() >= 4);

create trigger log_company_holidays
  after insert or delete or update on public.company_holidays
  for each row execute function log_change();
