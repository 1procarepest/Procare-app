-- 73 (2026-11-20). Forms (was Reports): Ally's "HR who cares" 6-month check-in and yearly review, saved with the
-- year reviews from change 60 (employee_reviews) so they show in Settings -> Reviews and, once shared, on the
-- person's My Profile page. Same people fill them in: the HR approver, C-Suite, the President and the person's managers.
-- Safe to run twice.
--  * employee_reviews.kind: 'green' (the G.R.E.E.N. ratings form from change 60), 'checkin' (6-month check-in),
--    'yearly' (yearly review). answers: the written answers, by question key (lib/reviews.js).
--  * recent_field_feedback(person): the last ride-alongs and follow-behinds' feedback the tech already saw (what they
--    did well, where to improve, the note), to go over during the check-in.

begin;

alter table public.employee_reviews add column if not exists kind text not null default 'green';
alter table public.employee_reviews add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.employee_reviews drop constraint if exists employee_reviews_kind_check;
alter table public.employee_reviews add constraint employee_reviews_kind_check check (kind in ('green', 'checkin', 'yearly'));

create or replace function public.recent_field_feedback(p_person uuid, p_limit integer default 3)
returns table (id uuid, kind text, day date, tech_praise text, improve text[], tech_note text)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind::text, r.day, r.tech_praise, r.improve, r.tech_note
  from field_reports r
  where r.tech_id = p_person and r.told_tech and can_review(p_person)
  order by r.day desc, r.created_at desc
  limit least(greatest(coalesce(p_limit, 3), 1), 10)
$$;
revoke all on function public.recent_field_feedback(uuid, integer) from public, anon;
grant execute on function public.recent_field_feedback(uuid, integer) to authenticated;

commit;

-- Check
select 'review kinds' as what, string_agg(kind || ' ' || n, ', ') as detail
from (select kind, count(*) as n from public.employee_reviews group by 1) x;
