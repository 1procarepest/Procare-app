-- 71 (2026-11-20). Ads: Google Guaranteed (Local Services Ads) and Google Ads spend and leads, read from the
-- Google Ads API, next to new customers from FieldRoutes: cost per lead and cost per customer (John, 2026-11-20).
-- For the ad team without logging in to Google: C-Suite, the President, and anyone given Ads access
-- (employees.ads_access, switched on in Ads -> Settings). Safe to run twice.
--  * gads_connection: the Google sign-in (refresh token). Server only: no app user can read it.
--  * gads_accounts: the ad accounts under the Procare manager account (100-402-6960), each optionally tied to an office.
--  * gads_daily: spend, impressions, clicks by day and campaign. gads_leads: each Google Guaranteed lead.
--    Both copied by the server (every morning, and Sync now). Only ads_data() reads them.
--  * ads_settings.fr_sources: the FieldRoutes lead sources that count as Google customers.

begin;

alter table public.employees add column if not exists ads_access boolean not null default false;

create or replace function public.can_see_ads()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_rank() >= 4, false)
      or exists (select 1 from employees e where e.id = my_id() and e.active and e.ads_access)
$$;
revoke all on function public.can_see_ads() from public, anon;
grant execute on function public.can_see_ads() to authenticated;

create table if not exists public.gads_connection (
  id              smallint primary key default 1 check (id = 1),
  refresh_token   text,
  google_email    text,
  connected_by    uuid references public.employees(id) on delete set null,
  connected_at    timestamptz,
  last_sync_at    timestamptz,
  last_sync_error text
);
alter table public.gads_connection enable row level security;   -- no policies: server only
revoke all on public.gads_connection from anon, authenticated;

create table if not exists public.gads_accounts (
  customer_id text primary key,          -- Google Ads customer ID, digits only
  name        text,
  office      text references public.offices(key) on delete set null,   -- set in Ads -> Settings
  status      text,
  updated_at  timestamptz not null default now()
);
create table if not exists public.gads_daily (
  date          date not null,
  customer_id   text not null,
  campaign_id   text not null,
  campaign_name text,
  channel_type  text,                    -- LOCAL_SERVICES = Google Guaranteed; SEARCH, PERFORMANCE_MAX, ...
  cost          numeric(12,2) not null default 0,
  impressions   integer not null default 0,
  clicks        integer not null default 0,
  conversions   numeric(10,2) not null default 0,
  primary key (date, customer_id, campaign_id)
);
create table if not exists public.gads_leads (
  lead_id      text primary key,
  customer_id  text not null,
  created_at   timestamp not null,       -- the ad account's local time (Atlanta)
  lead_type    text,                     -- PHONE_CALL, MESSAGE, BOOKING
  category     text,
  service      text,
  status       text,                     -- NEW, ACTIVE, BOOKED, DECLINED, EXPIRED, DISABLED, CONSUMER_DECLINED, WIPED_OUT
  charged      boolean not null default false,
  credit_state text,                     -- PENDING, CREDITED when Google refunds a lead
  synced_at    timestamptz not null default now()
);
create index if not exists gads_leads_created on public.gads_leads (created_at);
alter table public.gads_accounts enable row level security;
alter table public.gads_daily enable row level security;
alter table public.gads_leads enable row level security;
revoke all on public.gads_accounts, public.gads_daily, public.gads_leads from anon, authenticated;

create table if not exists public.ads_settings (
  id         smallint primary key default 1 check (id = 1),
  fr_sources text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.ads_settings (id) values (1) on conflict (id) do nothing;
alter table public.ads_settings enable row level security;
revoke all on public.ads_settings from anon, authenticated;
-- Start with the FieldRoutes lead sources that look like Google (can be changed in Ads -> Settings)
update public.ads_settings set fr_sources = coalesce((
  select array_agg(distinct trim(source)) from public.fr_subscriptions
  where source ~* 'google|guarantee|\mlsa\M' and date_added > now() - interval '2 years'), '{}')
where id = 1 and fr_sources = '{}';

-- Everything the Ads pages show for the dates
create or replace function public.ads_data(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  manage boolean := coalesce(my_rank() >= 4, false);
  srcs text[] := coalesce((select fr_sources from ads_settings where id = 1), '{}');
  result jsonb;
begin
  if not can_see_ads() or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then return null; end if;
  with newc as (   -- new FieldRoutes customers in the dates whose purchase came in under a Google lead source
    select s.customer_id, s.office, bool_or(wildlife_line(s.service_type) is not null) as wildlife,
           sum(coalesce(s.contract_value, 0)) as sold
    from fr_subscriptions s join fr_customers c on c.customer_id = s.customer_id
    where (c.date_added at time zone 'America/New_York')::date between p_from and p_to
      and (s.date_added at time zone 'America/New_York')::date between p_from and p_to
      and trim(s.source) = any (srcs)
    group by 1, 2
  )
  select jsonb_build_object(
    'accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', a.customer_id, 'name', a.name, 'office', a.office,
                   'office_name', o.name, 'status', a.status) order by a.name), '[]')
                 from gads_accounts a left join offices o on o.key = a.office),
    'spend', (select coalesce(jsonb_agg(x), '[]') from (
        select customer_id, campaign_id, max(campaign_name) as campaign_name, max(channel_type) as channel_type,
               sum(cost) as cost, sum(impressions) as impressions, sum(clicks) as clicks, sum(conversions) as conversions
        from gads_daily where date between p_from and p_to group by 1, 2) x),
    'days', (select coalesce(jsonb_agg(x order by x.date), '[]') from (
        select date, sum(cost) as cost from gads_daily where date between p_from and p_to group by 1) x),
    'leads', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select lead_id, customer_id, created_at, lead_type, category, service, status, charged, credit_state
        from gads_leads where created_at::date between p_from and p_to) x),
    'customers', (select coalesce(jsonb_agg(x), '[]') from (
        select office, wildlife, count(*) as n, sum(sold) as sold from newc group by 1, 2) x),
    'fr_sources', to_jsonb(srcs),
    'manage', manage,
    'connection', (select jsonb_build_object('connected', refresh_token is not null, 'email', google_email,
                     'connected_at', connected_at, 'last_sync_at', last_sync_at, 'last_sync_error', last_sync_error)
                   from gads_connection where id = 1),
    -- Settings (C-Suite and the President): lead sources to pick from, offices and who has Ads access
    'all_sources', case when manage then (select coalesce(jsonb_agg(distinct trim(source)), '[]') from fr_subscriptions
                     where coalesce(trim(source), '') <> '' and date_added > now() - interval '2 years') end,
    'offices', case when manage then (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'name', name) order by name), '[]') from offices) end,
    'people', case when manage then (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', trim(first_name || ' ' || coalesce(last_name, '')),
                     'level', level, 'department', department, 'ads_access', ads_access) order by first_name, last_name), '[]')
                   from employees where active) end
  ) into result;
  return result;
end $$;
revoke all on function public.ads_data(date, date) from public, anon;
grant execute on function public.ads_data(date, date) to authenticated;

-- Ads -> Settings (C-Suite and the President)
create or replace function public.set_ads_access(p_employee uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite and the President can change Ads access.'; end if;
  update employees set ads_access = coalesce(p_on, false), updated_at = now() where id = p_employee;
end $$;
create or replace function public.set_ads_sources(p_sources text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite and the President can change this.'; end if;
  update ads_settings set fr_sources = coalesce(p_sources, '{}'), updated_at = now() where id = 1;
end $$;
create or replace function public.set_ads_account_office(p_customer text, p_office text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite and the President can change this.'; end if;
  update gads_accounts set office = nullif(p_office, ''), updated_at = now() where customer_id = p_customer;
end $$;
revoke all on function public.set_ads_access(uuid, boolean), public.set_ads_sources(text[]), public.set_ads_account_office(text, text) from public, anon;
grant execute on function public.set_ads_access(uuid, boolean), public.set_ads_sources(text[]), public.set_ads_account_office(text, text) to authenticated;

commit;

-- Check
select 'ads tables' as what, case when to_regclass('public.gads_leads') is not null and to_regclass('public.gads_connection') is not null then 'ready' else 'missing' end as detail
union all select 'FieldRoutes lead sources counted as Google', coalesce(nullif(array_to_string(fr_sources, ', '), ''), '(none yet: pick them in Ads -> Settings)') from public.ads_settings where id = 1;
