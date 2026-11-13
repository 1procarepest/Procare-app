-- Read-only checks before building the Tech Scorecard (2026-11-13). Changes nothing.
-- One result: "what" and "value" columns.

select 'app employees linked to FieldRoutes / active' as what,
       (count(*) filter (where fr_ids is not null and fr_ids::text not in ('{}', '[]', 'null')))::text || ' / ' || count(*)::text as value
from public.employees where active
union all
select 'fr_ids examples', (select string_agg(fr_ids::text, ' | ') from
  (select fr_ids from public.employees where fr_ids is not null and fr_ids::text not in ('{}', '[]', 'null') limit 3) x)
union all
select 'samsara_driver_id filled', (select count(*)::text from public.employees where samsara_driver_id is not null and samsara_driver_id <> '')
union all
select 'appointment statuses (2026)', (select string_agg(concat(status, '=', coalesce(status_text, '?'), ': ', n), ', ') from
  (select status, status_text, count(*) n from public.fr_appointments where date >= '2026-01-01' group by 1, 2 order by 3 desc limit 10) s)
union all
select 'completed 2026: with production value / with serviced_by / total',
  (select concat(count(*) filter (where production_value is not null), ' / ', count(*) filter (where serviced_by is not null), ' / ', count(*))
   from public.fr_appointments where date >= '2026-01-01' and status = 1)
union all
select 'cancel reasons on 2026 cancels (top 12)', (select string_agg(concat(coalesce(cancel_reason, '(none)'), ': ', n), ', ') from
  (select cancel_reason, count(*) n from public.fr_subscriptions where date_cancelled >= '2026-01-01' group by 1 order by 2 desc limit 12) s)
union all
select 'reservices 2026 by type-ID list (scorecard rule)', (select count(*)::text from public.fr_appointments
  where date >= '2026-01-01' and status = 1
    and type_id in (27,30,32,33,34,35,54,61,79,80,81,82,83,125) and type_id not in (74,75,76,77,78))
union all
select 'reservices 2026 by name (operations rule)', (select count(*)::text from public.fr_appointments a
  join public.fr_service_types t on t.office = a.office and t.type_id = a.type_id
  where a.date >= '2026-01-01' and a.status = 1
    and (t.description ilike '%reservice%' or t.description ilike '%re-service%')
    and t.description not ilike '%incomplete%' and t.description not ilike '%partial%')
union all
select 'reservices 2026 by FieldRoutes flag', (select count(*)::text from public.fr_appointments a
  join public.fr_service_types t on t.office = a.office and t.type_id = a.type_id
  where a.date >= '2026-01-01' and a.status = 1 and t.is_reservice)
union all
select 'service types in the ID list', (select string_agg(distinct concat(type_id, ' ', description), ', ') from public.fr_service_types
  where type_id in (27,30,32,33,34,35,54,61,79,80,81,82,83,125,74,75,76,77,78))
union all
select 'reservice-named types NOT in the ID list', (select string_agg(distinct concat(type_id, ' ', description), ', ') from public.fr_service_types
  where (description ilike '%reservice%' or description ilike '%re-service%')
    and type_id not in (27,30,32,33,34,35,54,61,79,80,81,82,83,125,74,75,76,77,78));
