-- 2026-11-15-43 competition prizes, earnings and cash outs.
--   competitions.payouts: {"places": [100, 50, 25]} for leaderboards and office KPIs (1st, 2nd, 3rd …),
--                         {"rounds": [25, 50, 100, 500]} for brackets (paid to each winner of that round; the last is the champion's grand prize).
--                         Team and office prizes are split evenly among the members.
--   competition_awards:   one row per person per prize, written by the app (server, admin key) when a competition
--                         (or a bracket round) is over and the data has caught up. award_key keeps it to once each.
--   payout_requests:      a person cashes out everything not yet claimed (request_payout); the HR approver (Ally)
--                         or C-Suite / the President marks it paid (mark_payout_paid). Emails go both ways (/api/notify).
--                         Sales reps will later be paid through Everee; technicians and office staff are entered in ADP by hand.

begin;

alter table public.competitions add column if not exists payouts jsonb not null default '{"places": [0], "rounds": []}'::jsonb;
alter table public.competitions add column if not exists settled_at timestamptz;   -- every prize has been awarded

create table if not exists public.payout_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  amount       numeric not null check (amount > 0),
  status       text not null default 'requested' check (status in ('requested', 'paid')),
  requested_at timestamptz not null default now(),
  paid_at      timestamptz,
  paid_by      uuid references public.employees(id) on delete set null,
  note         text
);
create index if not exists payout_requests_emp on public.payout_requests (employee_id, requested_at desc);

create table if not exists public.competition_awards (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions(id) on delete set null,   -- earnings stay if a competition is deleted
  employee_id    uuid not null references public.employees(id) on delete cascade,
  award_key      text not null,                -- 'place' or 'round-0', 'round-1' …
  amount         numeric not null check (amount > 0),
  reason         text not null,                -- "1st place · November Blitz"
  payout_id      uuid references public.payout_requests(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (competition_id, employee_id, award_key)
);
create index if not exists competition_awards_emp on public.competition_awards (employee_id, created_at desc);

-- Who handles prize payouts: the HR approver (Ally), C-Suite and the President.
create or replace function public.can_manage_payouts()
returns boolean language sql stable security definer set search_path = public as $$
  select is_hr_approver() or my_rank() >= 4
$$;
revoke all on function public.can_manage_payouts() from public, anon;
grant execute on function public.can_manage_payouts() to authenticated;

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

-- Cash out everything the signed-in person has won and not yet claimed. Returns the request id (null if nothing).
create or replace function public.request_payout()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_id();
  total numeric;
  rid uuid;
begin
  if me is null then return null; end if;
  select coalesce(sum(amount), 0) into total from competition_awards where employee_id = me and payout_id is null;
  if total <= 0 then return null; end if;
  insert into payout_requests (employee_id, amount) values (me, total) returning id into rid;
  update competition_awards set payout_id = rid where employee_id = me and payout_id is null;
  return rid;
end $$;
revoke all on function public.request_payout() from public, anon;
grant execute on function public.request_payout() to authenticated;

-- Mark a cash out as paid (submitted to payroll). Returns true when it changed.
create or replace function public.mark_payout_paid(p_id uuid, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_payouts() then return false; end if;
  update payout_requests set status = 'paid', paid_at = now(), paid_by = my_id(), note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id and status = 'requested';
  return found;
end $$;
revoke all on function public.mark_payout_paid(uuid, text) from public, anon;
grant execute on function public.mark_payout_paid(uuid, text) to authenticated;

insert into public.notification_settings (key, label, enabled) values
  ('payout_request', 'Competition prize cash out: email the HR approver (Ally) to pay it', true),
  ('payout_paid',    'Competition prize paid: email the employee', true)
on conflict (key) do nothing;

commit;
