-- 72 (2026-11-20). Ads -> Website: the website's Google Analytics 4 numbers next to the ads (John, 2026-11-20).
-- Same Google sign-in as Google Ads (change 71), which now also asks for read-only Analytics. Same people see it:
-- C-Suite, the President and Ads access. Safe to run twice.
--  * gads_connection.ga_property / ga_property_name: which Analytics property is the website (Ads -> Settings).
--  * ga_daily_source: visits by day and where they came from. ga_daily_page: views by day and page.
--    ga_daily_event: key events (form sent, phone click, ...) by day. Copied by the server with the ads.

begin;

alter table public.gads_connection add column if not exists ga_property text;        -- digits, e.g. 123456789
alter table public.gads_connection add column if not exists ga_property_name text;

create table if not exists public.ga_daily_source (
  date        date not null,
  channel     text not null,              -- Organic Search, Paid Search, Direct, Organic Social, Referral, ...
  source      text not null,
  medium      text not null,
  sessions    integer not null default 0,
  users       integer not null default 0,
  new_users   integer not null default 0,
  engaged     integer not null default 0,
  key_events  numeric(10,2) not null default 0,
  primary key (date, channel, source, medium)
);
create table if not exists public.ga_daily_page (
  date       date not null,
  page       text not null,
  views      integer not null default 0,
  sessions   integer not null default 0,
  key_events numeric(10,2) not null default 0,
  primary key (date, page)
);
create table if not exists public.ga_daily_event (
  date  date not null,
  event text not null,
  count numeric(10,2) not null default 0,
  primary key (date, event)
);
alter table public.ga_daily_source enable row level security;
alter table public.ga_daily_page enable row level security;
alter table public.ga_daily_event enable row level security;
revoke all on public.ga_daily_source, public.ga_daily_page, public.ga_daily_event from anon, authenticated;

create or replace function public.website_data(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not can_see_ads() or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then return null; end if;
  select jsonb_build_object(
    'sources', (select coalesce(jsonb_agg(x), '[]') from (
        select channel, source, medium, sum(sessions) as sessions, sum(users) as users, sum(new_users) as new_users,
               sum(engaged) as engaged, sum(key_events) as key_events
        from ga_daily_source where date between p_from and p_to group by 1, 2, 3) x),
    'pages', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
        select page, sum(views) as views, sum(sessions) as sessions, sum(key_events) as key_events
        from ga_daily_page where date between p_from and p_to group by 1 order by 2 desc limit 25) x),
    'events', (select coalesce(jsonb_agg(x order by x.count desc), '[]') from (
        select event, sum(count) as count from ga_daily_event where date between p_from and p_to group by 1) x),
    'days', (select coalesce(jsonb_agg(x order by x.date), '[]') from (
        select date, sum(sessions) as sessions, sum(key_events) as key_events from ga_daily_source
        where date between p_from and p_to group by 1) x),
    'property', (select jsonb_build_object('id', ga_property, 'name', ga_property_name, 'connected', refresh_token is not null,
                   'last_sync_at', last_sync_at, 'last_sync_error', last_sync_error) from gads_connection where id = 1),
    'manage', coalesce(my_rank() >= 4, false)
  ) into result;
  return result;
end $$;
revoke all on function public.website_data(date, date) from public, anon;
grant execute on function public.website_data(date, date) to authenticated;

-- Ads -> Settings: which Analytics property is the website (C-Suite and the President)
create or replace function public.set_ga_property(p_id text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(my_rank() >= 4, false) then raise exception 'Only C-Suite and the President can change this.'; end if;
  insert into gads_connection (id) values (1) on conflict (id) do nothing;
  update gads_connection set ga_property = nullif(regexp_replace(coalesce(p_id, ''), '\D', '', 'g'), ''), ga_property_name = p_name where id = 1;
end $$;
revoke all on function public.set_ga_property(text, text) from public, anon;
grant execute on function public.set_ga_property(text, text) to authenticated;

commit;

-- Check
select 'website tables' as what, case when to_regclass('public.ga_daily_source') is not null then 'ready' else 'missing' end as detail;
