-- 2026-11-16-48 tech feedback leads with praise; one row per customer visit when picking a follow-behind.
-- John (after trying the preview): techs should see the positive feedback, and see it first, before what to work on.
--   field_reports.tech_praise  the manager's "What they did well" (the tech sees it)
--   my_feedback()              adds 'praise' (the manager's) and 'customer_praise' (a follow-behind customer's positive
--                              feedback). The rest of the answers still never reach the tech.
--   recent_stops()             a customer with several services on the same day (pest + termite) is one row, listing
--                              every service, instead of one row per service.

begin;

alter table public.field_reports add column if not exists tech_praise text;

create or replace function public.submit_field_report(p jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_id();
  t employees;
  rid uuid := (p->>'id')::uuid;
  k text := p->>'kind';
  d date := coalesce(nullif(p->>'day', '')::date, (now() at time zone 'America/New_York')::date);
  today date := (now() at time zone 'America/New_York')::date;
  n integer;
begin
  if me is null or not can_file_reports() then raise exception 'Only leads and managers can fill out reports.'; end if;
  if rid is null or k not in ('ride_along', 'follow_behind') then raise exception 'That report is missing something.'; end if;
  if d > today or d < today - 60 then raise exception 'The date has to be in the last 60 days.'; end if;
  select * into t from employees where id = nullif(p->>'tech_id', '')::uuid and department = 'technician';
  if not found then raise exception 'Pick a technician.'; end if;
  insert into field_reports (id, kind, author_id, tech_id, office, day, customer_id, appointment_id, customer,
                             answers, improve, tech_praise, tech_note, told_tech)
  values (rid, k, me, t.id, t.office, d, nullif(p->>'customer_id', '')::bigint, nullif(p->>'appointment_id', '')::bigint,
          nullif(trim(coalesce(p->>'customer', '')), ''), coalesce(p->'answers', '{}'::jsonb),
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'improve', '[]'::jsonb))), '{}'),
          nullif(trim(coalesce(p->>'tech_praise', '')), ''),
          nullif(trim(coalesce(p->>'tech_note', '')), ''), coalesce((p->>'told_tech')::boolean, false))
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into truck_issues (report_id, tech_id, office, item)
  select rid, t.id, t.office, trim(x) from jsonb_array_elements_text(coalesce(p->'truck_issues', '[]'::jsonb)) x
  where length(trim(x)) > 0;
  return true;
end $$;
revoke all on function public.submit_field_report(jsonb) from public, anon;
grant execute on function public.submit_field_report(jsonb) to authenticated;

create or replace function public.my_feedback()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reports', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'day', r.day, 'from', trim(a.first_name || ' ' || a.last_name),
        'customer', case when r.kind = 'follow_behind' then r.customer end,
        'customer_praise', case when r.kind = 'follow_behind' then nullif(trim(r.answers->>'positive'), '') end,
        'praise', r.tech_praise,
        'improve', r.improve, 'note', r.tech_note,
        'favorite', r.kind = 'follow_behind' and (r.answers->>'impression') = '5',
        'seen', r.tech_seen_at is not null) order by r.day desc, r.created_at desc), '[]')
      from field_reports r join employees a on a.id = r.author_id
      where r.tech_id = my_id() and r.told_tech and r.day >= (now() at time zone 'America/New_York')::date - 90),
    'truck', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'item', t.item, 'since', t.created_at) order by t.created_at), '[]')
      from truck_issues t where t.tech_id = my_id() and t.status = 'open')
  )
$$;
revoke all on function public.my_feedback() from public, anon;
grant execute on function public.my_feedback() to authenticated;

drop function if exists public.recent_stops(uuid);
create function public.recent_stops(p_tech uuid)
returns table (appointment_id bigint, day date, customer_id bigint, customer text, city text, service text,
               termite boolean, autopay boolean, checked boolean, pick integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  today date := (now() at time zone 'America/New_York')::date;
  ids bigint[];
begin
  if not can_file_reports() then return; end if;
  ids := tech_fr_ids(p_tech);
  return query
  with v as (   -- one row per customer per day, with every service done that day
    select a.customer_id, a.date as day, min(a.appointment_id) as appointment_id, array_agg(a.appointment_id) as appts,
           string_agg(distinct coalesce(t.description, ''), ' + ') as service
    from fr_appointments a
    left join fr_routes rr on rr.route_id = a.route_id
    left join fr_service_types t on t.office = a.office and t.type_id = a.type_id
    where a.status = 1 and a.date between today - 7 and today
      and coalesce(nullif(a.serviced_by, 0), nullif(a.assigned_tech, 0), rr.assigned_tech) = any (ids)
    group by a.customer_id, a.date
  )
  select v.appointment_id, v.day, v.customer_id,
         coalesce(nullif(trim(c.company_name), ''), trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '(unknown)'),
         initcap(nullif(trim(c.city), '')),
         v.service,
         exists (select 1 from fr_subscriptions s where s.customer_id = v.customer_id and s.active
                 and service_code(s.service_type) in ('TBS', 'TL')),
         coalesce(c.autopay, '') !~* '^(no|0|false|none)?$',
         exists (select 1 from field_reports f where f.kind = 'follow_behind' and f.appointment_id = any (v.appts)),
         (row_number() over (order by md5(v.appointment_id::text || today::text)))::int
  from v
  left join fr_customers c on c.customer_id = v.customer_id
  order by v.day desc, v.appointment_id;
end $$;
revoke all on function public.recent_stops(uuid) from public, anon;
grant execute on function public.recent_stops(uuid) to authenticated;

commit;
