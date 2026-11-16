-- Row level security for competition_awards and payout_requests (change 2026-11-15-43).
-- People read their own; can_manage_payouts() (HR approver, C-Suite, President) reads all. No direct writes.

alter table public.competition_awards enable row level security;
alter table public.payout_requests enable row level security;
drop policy if exists competition_awards_read on public.competition_awards;
create policy competition_awards_read on public.competition_awards for select to authenticated
  using (employee_id = my_id() or can_manage_payouts());
drop policy if exists payout_requests_read on public.payout_requests;
create policy payout_requests_read on public.payout_requests for select to authenticated
  using (employee_id = my_id() or can_manage_payouts());
-- No direct writes: awards come from the app's server, requests and payments through the functions below.

drop trigger if exists log_competition_awards on public.competition_awards;
create trigger log_competition_awards after insert or delete or update on public.competition_awards for each row execute function log_change();
drop trigger if exists log_payout_requests on public.payout_requests;
create trigger log_payout_requests after insert or delete or update on public.payout_requests for each row execute function log_change();
