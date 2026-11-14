-- 2026-11-13. Samsara safety scores switch to Samsara's current API (safety-scores/vehicles).
-- The legacy endpoint returned 0 for most trucks, so the stored scores were wrong. This clears them
-- (the sync re-fetches every period on its next run) and adds the per-behavior detail the new API gives.

begin;

delete from public.samsara_scores;   -- wrong scores from the legacy endpoint; refetched automatically

alter table public.samsara_scores
  add column if not exists behaviors jsonb,   -- [{behaviorType, count, scoreImpact}, …]
  add column if not exists speeding  jsonb;   -- [{speedingType, durationMilliseconds, scoreImpact}, …]

-- score is now null when the truck didn't drive in that period (no score, rather than 0).

commit;
