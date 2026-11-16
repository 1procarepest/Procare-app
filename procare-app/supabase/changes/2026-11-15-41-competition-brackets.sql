-- 2026-11-15-41 competition brackets: a seeding period, then an elimination bracket.
--   seed_end   = last day of the seeding period (a normal leaderboard from start_date to seed_end)
--   round_days = days per bracket round (already there); round 1 starts the day after seed_end
--   team_size  = 1 for person vs. person brackets, or 2-6 for balanced teams made from the seeding order
--   locked_at  = when the bracket was locked; competition_members.seed (and .team) then hold the seeding
-- end_date is set by the app to the end of the last round.

begin;

alter table public.competitions add column if not exists seed_end date;
alter table public.competitions add column if not exists team_size integer not null default 1;
alter table public.competitions add column if not exists locked_at timestamptz;

alter table public.competitions drop constraint if exists competitions_team_size;
alter table public.competitions add constraint competitions_team_size check (team_size between 1 and 6);
alter table public.competitions drop constraint if exists competitions_bracket;
alter table public.competitions add constraint competitions_bracket check (
  style = 'leaderboard'
  or (seed_end is not null and round_days is not null and seed_end >= start_date and seed_end < end_date)
);

commit;
