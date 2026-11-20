-- 66 (2026-11-19). Finance section: QuickBooks Online P&L by class (each office is a class; Wildlife is its own class)
-- and marketing cost per customer (marketing spend from QuickBooks / new customers by lead source from FieldRoutes).
-- For C-Suite and the President. Safe to run twice.
--  * qbo_connection: the QuickBooks link. Only the server (secret key) reads or writes it: no app user can see the
--    tokens, not even C-Suite. Connected by signing in to QuickBooks from Finance -> Settings.
--  * qbo_pl_monthly: each month's P&L lines by class, copied from QuickBooks by the server (daily, and Sync now).
--  * marketing_channels: each channel (Google Ads, Yelp, door-to-door, ...) = which QuickBooks accounts are its cost
--    and which FieldRoutes lead sources are its customers. Set in Finance -> Settings.
--  * finance_data(from, to): what the Finance pages show.

begin;

create or replace function public.can_see_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_rank() >= 4, false)
$$;
revoke all on function public.can_see_finance() from public, anon;
grant execute on function public.can_see_finance() to authenticated;

create table if not exists public.qbo_connection (
  id                 smallint primary key default 1 check (id = 1),
  realm_id           text,
  company_name       text,
  access_token       text,
  refresh_token      text,
  access_expires_at  timestamptz,
  refresh_expires_at timestamptz,
  connected_by       uuid references public.employees(id) on delete set null,
  connected_at       timestamptz,
  last_sync_at       timestamptz,
  last_sync_error    text
);
alter table public.qbo_connection enable row level security;   -- no policies: server only
revoke all on public.qbo_connection from anon, authenticated;

create table if not exists public.qbo_pl_monthly (
  month        date not null,          -- first of the month
  class        text not null,          -- QuickBooks class name ('Not specified' when none)
  section      text not null,          -- Income, Cost of Goods Sold, Expenses, Other Income, Other Expenses
  account_id   text not null,
  account_name text not null,
  parent_name  text,                   -- the parent account, for sub-accounts
  amount       numeric(14,2) not null default 0,
  synced_at    timestamptz not null default now(),
  primary key (month, class, account_id)
);
create index if not exists qbo_pl_monthly_month on public.qbo_pl_monthly (month);
alter table public.qbo_pl_monthly enable row level security;
drop policy if exists qbo_pl_read on public.qbo_pl_monthly;
create policy qbo_pl_read on public.qbo_pl_monthly for select to authenticated using (can_see_finance());
grant select on public.qbo_pl_monthly to authenticated;

create table if not exists public.marketing_channels (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  qbo_accounts text[] not null default '{}',   -- QuickBooks account names whose cost is this channel's
  fr_sources   text[] not null default '{}',   -- FieldRoutes lead sources whose new customers are this channel's
  sort         smallint not null default 0,
  updated_at   timestamptz not null default now()
);
alter table public.marketing_channels enable row level security;
drop policy if exists mkt_read on public.marketing_channels;
create policy mkt_read on public.marketing_channels for select to authenticated using (can_see_finance());
drop policy if exists mkt_write on public.marketing_channels;
create policy mkt_write on public.marketing_channels for all to authenticated using (can_see_finance()) with check (can_see_finance());
grant select, insert, update, delete on public.marketing_channels to authenticated;
drop trigger if exists log_marketing_channels on public.marketing_channels;
create trigger log_marketing_channels after insert or delete or update on public.marketing_channels
  for each row execute function log_change();

-- Starting channels (no accounts or sources yet: match them in Finance -> Settings)
insert into public.marketing_channels (name, sort)
select v.name, v.sort from (values ('Door-to-door', 1), ('Google Ads / Google leads', 2), ('Yelp', 3), ('Other lead services', 4)) v(name, sort)
where not exists (select 1 from public.marketing_channels);

create or replace function public.finance_data(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m_from date := date_trunc('month', p_from)::date;
  m_to date := date_trunc('month', p_to)::date;
  result jsonb;
begin
  if not can_see_finance() or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then return null; end if;
  with newc as (   -- new customers in the dates, by lead source, office and whether it's a wildlife job
    select s.source, s.office, bool_or(wildlife_line(s.service_type) is not null) as wildlife, s.customer_id
    from fr_subscriptions s join fr_customers c on c.customer_id = s.customer_id
    where (c.date_added at time zone 'America/New_York')::date between p_from and p_to
      and (s.date_added at time zone 'America/New_York')::date between p_from and p_to
    group by 1, 2, 4
  )
  select jsonb_build_object(
    'pl', (select coalesce(jsonb_agg(x), '[]') from (
        select class, section, account_id, account_name, parent_name, sum(amount) as amount
        from qbo_pl_monthly where month between m_from and m_to group by 1, 2, 3, 4, 5) x),
    'months', (select coalesce(jsonb_agg(distinct month order by month), '[]') from qbo_pl_monthly where month between m_from and m_to),
    'new_customers', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(nullif(trim(source), ''), 'Unknown') as source, office, wildlife, count(distinct customer_id) as n
        from newc group by 1, 2, 3) x),
    'channels', (select coalesce(jsonb_agg(to_jsonb(c) order by c.sort, c.name), '[]') from marketing_channels c),
    'sources', (select coalesce(jsonb_agg(distinct coalesce(nullif(trim(source), ''), 'Unknown')), '[]') from fr_subscriptions
                where date_added > now() - interval '2 years'),
    'accounts', (select coalesce(jsonb_agg(distinct jsonb_build_object('name', account_name, 'section', section)), '[]') from qbo_pl_monthly),
    'connection', (select jsonb_build_object('connected', refresh_token is not null, 'company', company_name,
                     'connected_at', connected_at, 'last_sync_at', last_sync_at, 'last_sync_error', last_sync_error,
                     'refresh_expires_at', refresh_expires_at) from qbo_connection where id = 1)
  ) into result;
  return result;
end $$;
revoke all on function public.finance_data(date, date) from public, anon;
grant execute on function public.finance_data(date, date) to authenticated;

commit;

-- Check
select 'finance tables' as what, case when to_regclass('public.qbo_pl_monthly') is not null and to_regclass('public.qbo_connection') is not null then 'ready' else 'missing' end as detail
union all select 'marketing channels', string_agg(name, ', ' order by sort) from public.marketing_channels;
