-- 2026-11-14. First appointments the app was missing.
-- FieldRoutes' appointment searches leave out cancelled appointments, so a sale whose first
-- appointment was cancelled or rescheduled had no first-service date in the app. Procare Sync now
-- asks for those first appointments by ID ("initials" step); this lists which ones it still needs.
--
-- fr_missing_initials(office): first-appointment IDs of sales from the last 2 years that aren't in
--   fr_appointments, skipping ones already asked for in the last 7 days (FieldRoutes may not return
--   deleted appointments, so they aren't asked for over and over). Only Procare Sync can call it.
-- fr_subscriptions.initial_checked_at: when Procare Sync last asked for that sale's first appointment.
--
-- Cancelled appointments are stored with status -1. Everything that counts jobs already leaves out
-- status -1 and "cancel"/"resched" statuses, so they don't show on routes or the scorecard.

begin;

alter table public.fr_subscriptions add column if not exists initial_checked_at timestamptz;
create index if not exists fr_subscriptions_initial_appt on public.fr_subscriptions (initial_appointment_id);

create or replace function public.fr_missing_initials(p_office text, p_limit integer default 5000)
returns setof bigint
language sql stable security definer set search_path = public as $$
  select s.initial_appointment_id
  from fr_subscriptions s
  where s.office = p_office
    and coalesce(s.initial_appointment_id, 0) > 0
    and s.date_added >= now() - interval '2 years'
    and (s.initial_checked_at is null or s.initial_checked_at < now() - interval '7 days')
    and not exists (select 1 from fr_appointments a where a.appointment_id = s.initial_appointment_id)
  group by s.initial_appointment_id
  limit p_limit
$$;
revoke all on function public.fr_missing_initials(text, integer) from public, anon, authenticated;
grant execute on function public.fr_missing_initials(text, integer) to service_role;

commit;
