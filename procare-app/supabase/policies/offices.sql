-- Row level security rules and triggers for public.offices.
--
-- Reference copy exported 2026-11-13. The app doesn't run this file. To change a
-- rule, paste a drop/create block into Supabase → SQL Editor, then update it here.
-- Helper functions (my_id, can_manage, …) are in ../functions.sql.

alter table public.offices enable row level security;

-- Everyone can read offices; only C-Suite and the President can change them.
create policy offices_read on public.offices
  for select to authenticated
  using (true);

create policy offices_write on public.offices
  for all to authenticated
  using (my_rank() >= 4)
  with check (my_rank() >= 4);
