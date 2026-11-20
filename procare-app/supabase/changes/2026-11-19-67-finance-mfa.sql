-- 67 (2026-11-19). Finance needs the second sign-in step (MFA). Run after 66.
-- C-Suite and the President see Finance only from a sign-in that passed the authenticator code (the token's "aal"
-- is aal2). This covers the P&L copy, marketing channels and finance_data(), so the books can't be read with just
-- an email and passcode, even outside the app's pages.
-- To reset someone's second step (lost phone): Supabase -> Authentication -> Users -> the person -> remove their
-- MFA factor; they set it up again next time they open Finance.
-- Safe to run twice.

begin;

create or replace function public.can_see_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_rank() >= 4, false) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

commit;

select 'Finance now needs the second sign-in step' as result;
