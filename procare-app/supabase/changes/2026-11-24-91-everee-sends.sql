-- 91 (2026-11-24). Everee sending (John): a log of every sales up front the app sends to Everee, so the Everee tab in
-- Sales → Pay shows what was sent, when and by whom, and never sends the same payday twice by accident.
-- Sales reps are 1099 contractors, so sending is two steps, each pressed by a person:
--   1. Send to Everee: creates the payable in Everee (pending; editable until paid). Nothing is paid.
--   2. Request payout: asks Everee to pay the sent items. They're paid once approved in Everee.
-- Only people who manage sales pay (can_manage_pay: C-Suite, the President, sales managers, "Processes sales pay").
-- Safe to run twice.
begin;

create table if not exists public.everee_payables (
  external_id          text primary key,                 -- procare::<rep id>::upfront::<payday>, the same id Everee keeps
  employee_id          uuid not null references public.employees(id) on delete restrict,
  payday               date not null,
  amount               numeric not null,
  label                text not null,
  everee_worker_id     text not null,
  status               text not null default 'sent' check (status in ('sent', 'payout_requested', 'error')),
  message              text,                              -- Everee's error, if any
  sent_by              uuid references public.employees(id) default public.my_id(),
  sent_at              timestamptz not null default now(),
  payout_requested_by  uuid references public.employees(id),
  payout_requested_at  timestamptz,
  payout_request_id    text
);
create index if not exists everee_payables_payday on public.everee_payables (payday);

alter table public.everee_payables enable row level security;
drop policy if exists everee_payables_read on public.everee_payables;
create policy everee_payables_read on public.everee_payables for select to authenticated using (can_manage_pay());
drop policy if exists everee_payables_write on public.everee_payables;
create policy everee_payables_write on public.everee_payables for insert to authenticated with check (can_manage_pay());
drop policy if exists everee_payables_update on public.everee_payables;
create policy everee_payables_update on public.everee_payables for update to authenticated using (can_manage_pay()) with check (can_manage_pay());
grant select, insert, update on public.everee_payables to authenticated;

commit;
notify pgrst, 'reload schema';

-- Check
select 'everee_payables table' as what, count(*)::text as detail from information_schema.tables
  where table_schema = 'public' and table_name = 'everee_payables';
