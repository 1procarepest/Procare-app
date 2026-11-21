-- 76 (2026-11-21). Finance → Debt: the debt schedule (John, 2026-11-21).
--  * qbo_bs_monthly: the QuickBooks balance sheet at the end of each month (copied every morning with the P&L).
--    QuickBooks is where loan balances come from: each loan is linked to its QuickBooks account.
--  * debts: everything that isn't a truck loan: the SBA loan, other long / short term loans, credit cards and lines.
--    Truck loans stay in truck_loans (change 75) and show on the same schedule.
--  * qbo_account_id / qbo_account_name on truck_loans and debts: the QuickBooks account that holds the balance.
--  * debt_data(): the Debt page. Monthly payments next to the P&L's net profit: how much of the bottom line goes to debt.
-- C-Suite and the President with the authenticator step (can_see_finance). No account numbers. Safe to run twice.

begin;

create table if not exists public.qbo_bs_monthly (
  month        date not null,          -- first of the month; the balance is at the END of that month
  account_id   text not null,
  section      text not null,          -- Assets, Liabilities, Equity
  grp          text,                   -- QuickBooks group: CreditCards, LongTermLiabilities, OtherCurrentLiabilities, FixedAssets, ...
  account_name text not null,
  parent_name  text,
  amount       numeric(14,2) not null default 0,
  synced_at    timestamptz not null default now(),
  primary key (month, account_id)
);
create index if not exists qbo_bs_monthly_month on public.qbo_bs_monthly (month);
alter table public.qbo_bs_monthly enable row level security;
drop policy if exists qbo_bs_read on public.qbo_bs_monthly;
create policy qbo_bs_read on public.qbo_bs_monthly for select to authenticated using (can_see_finance());
grant select on public.qbo_bs_monthly to authenticated;
alter table public.qbo_connection add column if not exists bs_sync_error text;

create table if not exists public.debts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  kind             text not null default 'long' check (kind in ('long', 'short', 'card', 'other')),
  lender           text,
  payment          numeric(12,2),        -- per month
  start_on         date,
  end_on           date,
  rate             numeric(6,3),         -- percent
  rate_note        text,                 -- "Prime + ?%"
  original         numeric(14,2),
  credit_limit     numeric(14,2),
  balance          numeric(14,2),        -- typed in; QuickBooks wins once linked
  balance_on       date,
  purpose          text,
  qbo_account_id   text,
  qbo_account_name text,
  active           boolean not null default true,
  sort             integer not null default 0,
  updated_at       timestamptz not null default now()
);
alter table public.debts enable row level security;
revoke all on public.debts from anon, authenticated;
drop trigger if exists log_debts on public.debts;
create trigger log_debts after insert or delete or update on public.debts for each row execute function log_change();

alter table public.truck_loans add column if not exists qbo_account_id text;
alter table public.truck_loans add column if not exists qbo_account_name text;

create or replace function public.debt_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  last_month date := (select max(month) from qbo_bs_monthly);
  result jsonb;
begin
  if not can_see_finance() then return null; end if;
  select jsonb_build_object(
    'truck_loans', (select coalesce(jsonb_agg(x order by x.truck_no), '[]') from (
        select l.*, t.truck_no, t.year, t.make, t.model, t.office, t.status as truck_status, t.vin
        from truck_loans l join trucks t on t.id = l.truck_id) x),
    'debts', (select coalesce(jsonb_agg(to_jsonb(d) order by d.kind, d.sort, d.name), '[]') from debts d),
    'bs_month', last_month,
    'accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', b.account_id, 'name', b.account_name, 'parent', b.parent_name,
                   'grp', b.grp, 'section', b.section, 'amount', b.amount) order by b.grp, b.account_name), '[]')
                 from qbo_bs_monthly b where b.month = last_month),
    'history', (select coalesce(jsonb_agg(x order by x.month), '[]') from (
        select month, sum(amount) filter (where section = 'Liabilities') as liabilities,
               sum(amount) filter (where grp = 'CreditCards') as cards,
               sum(amount) filter (where grp = 'LongTermLiabilities') as long_term
        from qbo_bs_monthly group by 1) x),
    'profit', (select coalesce(jsonb_agg(x order by x.month), '[]') from (
        select month,
               sum(case when section in ('Income', 'Other Income') then amount else -amount end) as net,
               sum(amount) filter (where section in ('Expenses', 'Other Expenses') and account_name ilike '%interest%') as interest
        from qbo_pl_monthly group by 1) x),
    'connection', (select jsonb_build_object('connected', refresh_token is not null, 'last_sync_at', last_sync_at,
                     'last_sync_error', last_sync_error, 'bs_sync_error', bs_sync_error) from qbo_connection where id = 1)
  ) into result;
  return result;
end $$;
revoke all on function public.debt_data() from public, anon;
grant execute on function public.debt_data() to authenticated;

-- Add / change / delete a loan, card or line (not truck loans: those are on the truck)
create or replace function public.save_debt(p_id uuid, p jsonb, p_delete boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := p_id;
begin
  if not can_see_finance() then raise exception 'Only C-Suite and the President can change debts.'; end if;
  if p_delete then delete from debts where id = p_id; return null; end if;
  if v is null then insert into debts (name) values (coalesce(nullif(trim(p ->> 'name'), ''), 'New loan')) returning id into v; end if;
  update debts set
    name         = coalesce(nullif(trim(p ->> 'name'), ''), name),
    kind         = coalesce(nullif(p ->> 'kind', ''), kind),
    lender       = nullif(trim(p ->> 'lender'), ''),
    payment      = nullif(p ->> 'payment', '')::numeric,
    start_on     = nullif(p ->> 'start_on', '')::date,
    end_on       = nullif(p ->> 'end_on', '')::date,
    rate         = nullif(p ->> 'rate', '')::numeric,
    rate_note    = nullif(trim(p ->> 'rate_note'), ''),
    original     = nullif(p ->> 'original', '')::numeric,
    credit_limit = nullif(p ->> 'credit_limit', '')::numeric,
    balance      = nullif(p ->> 'balance', '')::numeric,
    balance_on   = case when nullif(p ->> 'balance', '') is null then null else coalesce(nullif(p ->> 'balance_on', '')::date, (now() at time zone 'America/New_York')::date) end,
    purpose      = nullif(trim(p ->> 'purpose'), ''),
    active       = coalesce((p ->> 'active')::boolean, true),
    updated_at   = now()
  where id = v;
  return v;
end $$;
revoke all on function public.save_debt(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_debt(uuid, jsonb, boolean) to authenticated;

-- Link a truck loan or a debt to the QuickBooks account that holds its balance (null = unlink)
create or replace function public.link_debt_account(p_kind text, p_id uuid, p_account_id text, p_account_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_see_finance() then raise exception 'Only C-Suite and the President can change this.'; end if;
  if p_kind = 'truck' then
    update truck_loans set qbo_account_id = nullif(p_account_id, ''), qbo_account_name = nullif(p_account_name, ''), updated_at = now() where id = p_id;
  elsif p_kind = 'debt' then
    update debts set qbo_account_id = nullif(p_account_id, ''), qbo_account_name = nullif(p_account_name, ''), updated_at = now() where id = p_id;
  else raise exception 'Unknown kind.';
  end if;
end $$;
revoke all on function public.link_debt_account(text, uuid, text, text) from public, anon;
grant execute on function public.link_debt_account(text, uuid, text, text) to authenticated;

commit;

-- Check
select 'debt schedule' as what, case when to_regclass('public.debts') is not null and to_regclass('public.qbo_bs_monthly') is not null then 'ready' else 'missing' end as detail;
