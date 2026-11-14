-- Read-only (2026-11-14): production values, saved routes, subscription names and auto-pay values.
-- Changes nothing. One result: "what" and "value" columns.

select 'production on completed jobs this month: negative / zero / positive / total $' as what,
  (select concat(count(*) filter (where production_value < 0), ' / ', count(*) filter (where coalesce(production_value, 0) = 0), ' / ',
                 count(*) filter (where production_value > 0), ' / $', round(sum(production_value)))
   from public.fr_appointments where date >= date_trunc('month', now()) and status = 1) as value
union all
select 'negative production examples (type, value)', (select string_agg(concat(coalesce(t.description, a.type_id::text), ' ', a.production_value), ' | ')
  from (select * from public.fr_appointments where date >= date_trunc('month', now()) and status = 1 and production_value < 0 limit 8) a
  left join public.fr_service_types t on t.office = a.office and t.type_id = a.type_id)
union all
select 'positive production examples (type, value)', (select string_agg(concat(coalesce(t.description, a.type_id::text), ' ', a.production_value), ' | ')
  from (select * from public.fr_appointments where date >= date_trunc('month', now()) and status = 1 and production_value > 0 limit 8) a
  left join public.fr_service_types t on t.office = a.office and t.type_id = a.type_id)
union all
select 'saved routes by day: jobs / completed that day', (select string_agg(concat(d, ': ', n, ' / ', done), ', ') from (
  select rs.snap_date as d, count(*) as n, count(*) filter (where a.status = 1 and a.date = rs.snap_date) as done
  from public.route_snapshots rs left join public.fr_appointments a on a.appointment_id = rs.appointment_id group by 1 order by 1) x)
union all
select 'appointments today: pending / completed / last synced', (select concat(count(*) filter (where status = 0), ' / ', count(*) filter (where status = 1), ' / ',
  to_char(max(synced_at) at time zone 'America/New_York', 'Mon DD HH12:MI AM'))
  from public.fr_appointments where date = (now() at time zone 'America/New_York')::date)
union all
select 'active subscription service names (count)', (select string_agg(concat(service_type, ': ', n), ' | ') from (
  select coalesce(service_type, '(blank)') as service_type, count(*) n from public.fr_subscriptions where active group by 1 order by 2 desc limit 60) x)
union all
select 'customer auto-pay values (count)', (select string_agg(concat(coalesce(autopay, '(blank)'), ': ', n), ', ') from (
  select autopay, count(*) n from public.fr_customers where status = 1 group by 1 order by 2 desc) x)
union all
select 'auto-pay changes logged since the sync started', (select concat(count(*), ' (', count(*) filter (where coalesce(autopay_before, 'No') ~* '^(no|0|false|none)?$'
  and coalesce(autopay_after, '') !~* '^(no|0|false|none)?$'), ' turned on)') from public.fr_autopay_changes);
