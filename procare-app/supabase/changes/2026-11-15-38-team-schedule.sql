-- 2026-11-15-38 team schedule: who's working each day of a week.
-- Sales: everyone in sales sees the whole sales team (who's selling that day).
-- Operations (technicians and office): managers and up in those departments see them.
-- C-Suite and the President see everyone. Time off shows only dates, times and status, never notes.

begin;

-- Which departments the signed-in person may see on the team schedule
create or replace function public.team_schedule_depts()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when my_rank() >= 4 then array['sales', 'technician', 'administrative']
    when my_department() = 'sales' then array['sales']
    when my_rank() >= 3 then array['technician', 'administrative']
    else array[]::text[]
  end
$$;
revoke all on function public.team_schedule_depts() from public, anon;
grant execute on function public.team_schedule_depts() to authenticated;

create or replace function public.team_schedule(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  depts text[] := team_schedule_depts();
  result jsonb;
begin
  if my_id() is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 or cardinality(depts) = 0 then
    return null;
  end if;
  with people as (
    select e.id, e.first_name, e.last_name, e.office, e.department::text as department, e.level::text as level, e.photo_url
    from employees e
    where e.active and e.department::text = any (depts)
  )
  select jsonb_build_object(
    'depts', to_jsonb(depts),
    'people', (select coalesce(jsonb_agg(p order by p.department, p.first_name, p.last_name), '[]') from people p),
    'schedules', (select coalesce(jsonb_agg(jsonb_build_object('e', s.employee_id, 'd', s.weekday, 's', s.start_time, 'x', s.end_time)), '[]')
                  from schedules s join people p on p.id = s.employee_id),
    'off', (select coalesce(jsonb_agg(jsonb_build_object('e', t.employee_id, 'a', t.start_date, 'b', t.end_date,
                    's', t.start_time, 'x', t.end_time, 'st', t.status)), '[]')
            from time_off_requests t join people p on p.id = t.employee_id
            where t.status in ('pending', 'approved') and t.start_date <= p_to and t.end_date >= p_from)
  ) into result;
  return result;
end $$;
revoke all on function public.team_schedule(date, date) from public, anon;
grant execute on function public.team_schedule(date, date) to authenticated;

commit;
