-- Read-only: what do the stored Samsara safety scores look like? (2026-11-13) Changes nothing.

select window_key,
       count(*)                               as trucks,
       count(*) filter (where score = 0)      as score_zero,
       count(*) filter (where miles = 0)      as no_miles,
       round(avg(score) filter (where score > 0)) as avg_nonzero_score,
       min(score) filter (where score > 0)    as lowest,
       max(score)                             as highest,
       round(avg(miles))                      as avg_miles
from public.samsara_scores
group by window_key
order by window_key;
