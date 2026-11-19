-- 57 (2026-11-19). Company holidays: one on/off switch per holiday. The dates come from lib/holidays.js, so they
-- roll forward each year. A holiday that's on is a day off for everyone except sales reps (they keep their own).
-- Everyone can read the switches; C-Suite and the President flip them in Settings → Holidays.
-- On to start: Thanksgiving, Christmas Eve, Christmas Day, New Year's Eve and New Year's Day.
-- Also sets Lisa Schaal's reservice-count goal to "Total reservices", under 450 (see below).

begin;

create table if not exists public.company_holidays (
  key        text primary key,
  name       text not null,
  enabled    boolean not null default false,
  sort       smallint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.company_holidays (key, name, enabled, sort) values
  ('new_years_day',          'New Year’s Day',             true,  1),
  ('mlk_day',                'Martin Luther King Jr. Day', false, 2),
  ('presidents_day',         'Presidents’ Day',            false, 3),
  ('memorial_day',           'Memorial Day',               false, 4),
  ('juneteenth',             'Juneteenth',                 false, 5),
  ('independence_day',       'Independence Day',           false, 6),
  ('labor_day',              'Labor Day',                  false, 7),
  ('columbus_day',           'Columbus Day',               false, 8),
  ('veterans_day',           'Veterans Day',               false, 9),
  ('thanksgiving',           'Thanksgiving',               true,  10),
  ('day_after_thanksgiving', 'Day after Thanksgiving',     false, 11),
  ('christmas_eve',          'Christmas Eve',              true,  12),
  ('christmas_day',          'Christmas Day',              true,  13),
  ('new_years_eve',          'New Year’s Eve',             true,  14)
on conflict (key) do nothing;

alter table public.company_holidays enable row level security;

drop policy if exists holidays_read on public.company_holidays;
create policy holidays_read on public.company_holidays
  for select to authenticated
  using (true);

drop policy if exists holidays_write on public.company_holidays;
create policy holidays_write on public.company_holidays
  for update to authenticated
  using (my_rank() >= 4)
  with check (my_rank() >= 4);

drop trigger if exists log_company_holidays on public.company_holidays;
create trigger log_company_holidays
  after insert or delete or update on public.company_holidays
  for each row execute function log_change();

grant select, update on public.company_holidays to authenticated;

-- Also (John, 2026-11-19): Lisa Schaal's reservice-count goal is "Total reservices", goal 450, in any quarter
-- not yet approved. Changes nothing if it already says that.
update public.bonus_goals g
set label = 'Total reservices', target = 450
from public.bonus_sets s, public.bonus_members m, public.employees e
where g.set_id = s.id and m.set_id = s.id and m.employee_id = e.id
  and lower(e.first_name) = 'lisa' and lower(e.last_name) = 'schaal'
  and g.kind = 'resv_count' and s.approved_at is null
  and (g.label <> 'Total reservices' or g.target <> 450);

commit;

-- Check (Supabase shows only this last result): the holidays that are on, and Lisa's reservice goal
select 'Holiday on' as what, name as detail from public.company_holidays where enabled
union all
select 'Lisa''s goal', s.name || ' Q' || s.quarter || ' ' || s.year || ': ' || g.label || ', under ' || g.target
from public.bonus_goals g
join public.bonus_sets s on s.id = g.set_id
join public.bonus_members m on m.set_id = s.id
join public.employees e on e.id = m.employee_id
where lower(e.first_name) = 'lisa' and lower(e.last_name) = 'schaal' and g.kind = 'resv_count';
