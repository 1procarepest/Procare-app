-- 2026-11-13. More FieldRoutes fields, found by the sync's inspectFields check.
-- Adds columns only (the tables are still empty). Run before pasting the updated script.

begin;

alter table public.fr_subscriptions
  add column if not exists annual_recurring_value numeric(12,2),   -- FieldRoutes' own annual value
  add column if not exists sold_by_3       bigint,
  add column if not exists preferred_tech  bigint,
  add column if not exists last_completed  date,
  add column if not exists expiration_date date;

alter table public.fr_customers
  add column if not exists salesman_apay      text,      -- FieldRoutes salesmanAPay (meaning to confirm)
  add column if not exists pending_cancel     boolean,
  add column if not exists commercial         boolean,
  add column if not exists preferred_tech_id  bigint,
  add column if not exists date_cancelled     date;

alter table public.fr_appointments
  add column if not exists completed_by           bigint,
  add column if not exists cancellation_reason_id bigint,
  add column if not exists date_cancelled         timestamptz;

alter table public.fr_employees
  add column if not exists email                text,     -- work email (links to app logins)
  add column if not exists linked_employee_ids  bigint[], -- same person's IDs in other offices
  add column if not exists supervisor_id        bigint;

alter table public.fr_service_types
  add column if not exists category        text,
  add column if not exists is_initial      boolean,
  add column if not exists regular_service boolean,
  add column if not exists visible         boolean;

-- Reviews: FieldRoutes calls this ID feedbackID; keep whether it was marked favorable.
alter table public.fr_reviews
  add column if not exists favorable boolean;

commit;
