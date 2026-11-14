-- Read-only (2026-11-14): who does FieldRoutes list on today's appointments? Changes nothing.

select 'Zach Fonticoba app record: active / FieldRoutes IDs' as what,
  (select string_agg(concat(active, ' / ', fr_ids::text), ' | ') from public.employees where first_name ilike 'zach%' and last_name ilike 'fonticoba%') as value
union all
select 'Zach in FieldRoutes (office, ID, type, active)',
  (select string_agg(concat(office, ' ', employee_id, ' type ', type, ' ', active), ' | ') from public.fr_employees where first_name ilike 'zach%' and last_name ilike 'fonticoba%')
union all
select 'today: employee on the appointment (name, type, jobs)', (select string_agg(concat(coalesce(f.first_name || ' ' || f.last_name, a.employee_id::text), ' t', f.type, ': ', a.n), ' | ')
  from (select employee_id, count(*) n from public.fr_appointments where date = (now() at time zone 'America/New_York')::date group by 1) a
  left join lateral (select * from public.fr_employees f where f.employee_id = a.employee_id limit 1) f on true)
union all
select 'today: routes (route ID: jobs)', (select string_agg(concat(route_id, ': ', n), ', ') from
  (select route_id, count(*) n from public.fr_appointments where date = (now() at time zone 'America/New_York')::date group by 1 order by 2 desc) r)
union all
select 'today: appointments synced / last update', (select concat(count(*), ' / ', to_char(max(synced_at) at time zone 'America/New_York', 'Mon DD HH12:MI AM'))
  from public.fr_appointments where date = (now() at time zone 'America/New_York')::date);
