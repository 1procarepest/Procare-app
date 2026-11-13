-- 2026-11-13. One shared copy of FieldRoutes data, filled by the "Procare Sync" Apps Script
-- (procare-app/sync/ProcareSync.gs). Every app reads from here instead of calling FieldRoutes.
--
-- Adds tables only; changes nothing that exists. Row level security is on and there are no
-- rules yet, so signed-in people can't read these tables directly. Only the sync (secret key)
-- reads and writes them. Each app gets its own read rules when it's built.
--
-- Privacy: customers are stored with last name (or business name) only. No first names,
-- addresses, phone numbers, emails, card or bank details, or note text. Doors keep a
-- location and city (for rep work areas) and only a yes/no for whether contact info was taken.
-- IDs are FieldRoutes IDs, which are unique across all three offices.

begin;

-- ---------- Lists (refreshed hourly) ----------

create table if not exists public.fr_employees (
  office      text not null references public.offices(key),
  employee_id bigint not null,
  first_name  text,
  last_name   text,
  type        smallint,            -- 0 office, 1 technician, 2 sales rep
  active      boolean,
  pic         text,                -- FieldRoutes photo file name
  synced_at   timestamptz not null default now(),
  primary key (office, employee_id)
);

create table if not exists public.fr_service_types (
  office       text not null references public.offices(key),
  type_id      bigint not null,
  description  text,
  is_reservice boolean,            -- FieldRoutes' own reservice flag, if it sends one
  synced_at    timestamptz not null default now(),
  primary key (office, type_id)
);

create table if not exists public.fr_cancellation_reasons (
  office    text not null references public.offices(key),
  reason_id bigint not null,
  name      text,
  synced_at timestamptz not null default now(),
  primary key (office, reason_id)
);

-- ---------- Customers ----------

create table if not exists public.fr_customers (
  customer_id        bigint primary key,
  office             text references public.offices(key),
  last_name          text,
  company_name       text,
  status             smallint,     -- 1 active
  autopay            text,         -- FieldRoutes aPay: No / CC / ACH
  autopay_profile_id bigint,
  balance            numeric(12,2),
  balance_age        integer,      -- days
  date_added         timestamptz,
  date_updated       timestamptz,
  synced_at          timestamptz not null default now()
);
create index if not exists fr_customers_office_status on public.fr_customers (office, status);

-- Card/bank on file: status only (1 valid, 2 invalid, 3 expired, 4 last charge failed).
create table if not exists public.fr_payment_profiles (
  payment_profile_id bigint primary key,
  office             text references public.offices(key),
  customer_id        bigint,
  status             smallint,
  synced_at          timestamptz not null default now()
);
create index if not exists fr_payment_profiles_customer on public.fr_payment_profiles (customer_id);

-- Every time a customer's auto-pay setting changes, as the sync sees it. FieldRoutes doesn't
-- record who turned auto-pay on or when, so this log is the only history. It starts the day
-- the sync starts and feeds the auto-pay report, competitions and pay.
create table if not exists public.fr_autopay_changes (
  id             bigserial primary key,
  office         text,
  customer_id    bigint not null,
  changed_at     timestamptz not null default now(),
  autopay_before text,
  autopay_after  text
);
create index if not exists fr_autopay_changes_when on public.fr_autopay_changes (changed_at);

create or replace function public.fr_track_autopay()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    if new.autopay is distinct from old.autopay then
      insert into public.fr_autopay_changes (office, customer_id, autopay_before, autopay_after)
      values (new.office, new.customer_id, old.autopay, new.autopay);
    end if;
  elsif coalesce(new.autopay, '') !~* '^(no|0|false|none)?$'
        and new.date_added >= now() - interval '7 days' then
    -- A brand-new customer who starts with auto-pay on.
    insert into public.fr_autopay_changes (office, customer_id, autopay_before, autopay_after)
    values (new.office, new.customer_id, null, new.autopay);
  end if;
  return null;
end
$$;

drop trigger if exists fr_customers_autopay on public.fr_customers;
create trigger fr_customers_autopay
  after insert or update of autopay on public.fr_customers
  for each row execute function fr_track_autopay();

-- ---------- Subscriptions (services sold) ----------

create table if not exists public.fr_subscriptions (
  subscription_id            bigint primary key,
  office                     text references public.offices(key),
  customer_id                bigint,
  service_id                 bigint,
  service_type               text,
  active                     boolean,
  date_added                 timestamptz,   -- sold
  date_cancelled             date,
  date_updated               timestamptz,
  sold_by                    bigint,
  sold_by_2                  bigint,
  source                     text,
  frequency                  integer,       -- days; -1 one-time, 0 as needed, -3 custom
  billing_frequency          text,
  recurring_charge           numeric(12,2),
  contract_value             numeric(12,2),
  initial_service_total      numeric(12,2),
  initial_appointment_id     bigint,
  initial_status             smallint,
  initial_status_text        text,
  autopay_payment_profile_id bigint,
  next_service               date,
  on_hold                    boolean,
  seasonal_start             text,
  seasonal_end               text,
  completed_appointment_ids  bigint[],
  cancel_reason              text,
  synced_at                  timestamptz not null default now()
);
create index if not exists fr_subscriptions_customer on public.fr_subscriptions (customer_id);
create index if not exists fr_subscriptions_sold on public.fr_subscriptions (office, date_added);
create index if not exists fr_subscriptions_sold_by on public.fr_subscriptions (sold_by, date_added);
create index if not exists fr_subscriptions_cancelled on public.fr_subscriptions (office, date_cancelled);

-- ---------- Appointments ----------

create table if not exists public.fr_appointments (
  appointment_id          bigint primary key,
  office                  text references public.offices(key),
  customer_id             bigint,
  subscription_id         bigint,
  date                    date,
  start_time              time,
  end_time                time,
  status                  smallint,      -- 0 pending, 1 completed, -1 cancelled (FieldRoutes codes)
  status_text             text,
  type_id                 bigint,        -- service type
  employee_id             bigint,        -- scheduled tech
  serviced_by             bigint,        -- tech who completed it
  route_id                bigint,
  spot_id                 bigint,
  is_initial              boolean,
  production_value        numeric(12,2),
  original_appointment_id bigint,
  reservice_reason_id     bigint,
  date_added              timestamptz,
  date_completed          timestamptz,
  date_updated            timestamptz,
  synced_at               timestamptz not null default now()
);
create index if not exists fr_appointments_office_date on public.fr_appointments (office, date);
create index if not exists fr_appointments_tech_date on public.fr_appointments (serviced_by, date);
create index if not exists fr_appointments_assigned_date on public.fr_appointments (employee_id, date);
create index if not exists fr_appointments_subscription on public.fr_appointments (subscription_id);
create index if not exists fr_appointments_customer on public.fr_appointments (customer_id);

-- ---------- Doors (sales knocking) ----------

create table if not exists public.fr_doors (
  door_id      bigint primary key,
  office       text references public.offices(key),
  employee_id  bigint,
  status       smallint,   -- 0 not home, 1 call back, 2 gave pitch, 3 made sale, 4 not interested, 5 never knock
  knocks       integer,
  has_info     boolean,    -- a name, phone or email was collected (the details aren't stored)
  latitude     double precision,
  longitude    double precision,
  city         text,
  zip          text,
  time_created timestamptz,
  date_updated timestamptz,
  synced_at    timestamptz not null default now()
);
create index if not exists fr_doors_rep_time on public.fr_doors (employee_id, time_created);
create index if not exists fr_doors_office_time on public.fr_doors (office, time_created);

-- ---------- Reviews ----------

create table if not exists public.fr_reviews (
  review_id      bigint primary key,
  office         text references public.offices(key),
  appointment_id bigint,
  customer_id    bigint,
  employee_id    bigint,
  review_date    timestamptz,
  stars          numeric(3,1),
  synced_at      timestamptz not null default now()
);
create index if not exists fr_reviews_appointment on public.fr_reviews (appointment_id);
create index if not exists fr_reviews_date on public.fr_reviews (review_date);

-- ---------- Sync log ----------
-- One row per sync run: what ran, how many FieldRoutes calls it used, and any errors.

create table if not exists public.fr_sync_runs (
  id          bigserial primary key,
  started_at  timestamptz not null,
  finished_at timestamptz not null default now(),
  steps       text[],
  api_calls   integer not null default 0,
  ok          boolean not null default true,
  errors      text
);
create index if not exists fr_sync_runs_started on public.fr_sync_runs (started_at);

-- ---------- Lock them down ----------

alter table public.fr_employees            enable row level security;
alter table public.fr_service_types        enable row level security;
alter table public.fr_cancellation_reasons enable row level security;
alter table public.fr_customers            enable row level security;
alter table public.fr_payment_profiles     enable row level security;
alter table public.fr_autopay_changes      enable row level security;
alter table public.fr_subscriptions        enable row level security;
alter table public.fr_appointments         enable row level security;
alter table public.fr_doors                enable row level security;
alter table public.fr_reviews              enable row level security;
alter table public.fr_sync_runs            enable row level security;

commit;

-- FieldRoutes calls used per day (Eastern), to compare against the 3,000 limit.
-- Run any time:
--   select (started_at at time zone 'America/New_York')::date as day, sum(api_calls) as calls,
--          count(*) as runs, count(*) filter (where not ok) as runs_with_errors
--   from public.fr_sync_runs group by 1 order by 1 desc;
