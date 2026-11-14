-- Read-only: did the Samsara backfill load? (2026-11-13) Changes nothing.

select 'trucks' as what, count(*)::text as value from public.samsara_vehicles
union all select 'techs matched to a truck / active techs',
  (select count(*) filter (where vehicle_id is not null) || ' / ' || count(*) from public.tech_vehicles)
union all select 'techs with no truck match', (select string_agg(e.first_name || ' ' || e.last_name, ', ' order by e.last_name)
  from public.tech_vehicles v join public.employees e on e.id = v.employee_id where v.vehicle_id is null)
union all select 'safety events / earliest', (select count(*) || ' / ' || coalesce(min(event_time)::date::text, '-') from public.samsara_events)
union all select 'scores stored (truck × period)', (select count(*)::text from public.samsara_scores)
union all select 'this month: average score', (select round(avg(score))::text from public.samsara_scores where window_key = 'thisMonth:cur' and miles > 0)
union all select 'Samsara calls / runs with errors', (select coalesce(sum(samsara_calls), 0) || ' / ' || count(*) filter (where not ok)
  from public.fr_sync_runs where started_at > now() - interval '1 hour')
union all select 'latest error', (select left(errors, 300) from public.fr_sync_runs where not ok and started_at > now() - interval '1 hour' order by id desc limit 1);
