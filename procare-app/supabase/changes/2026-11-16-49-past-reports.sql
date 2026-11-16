-- 2026-11-16-49 log a ride-along or follow-behind that was already done (before the app had the forms).
-- John: managers did some this quarter on the Google Forms; count them so the rest of the year is accurate,
-- without retyping the answers. A past report has answers {"past": true}, counts as "told the tech", sends no
-- emails, and never shows on the tech's home page (there's no feedback in it).
--   log_past_report(tech, kind, day, author): the manager logs their own; Ally, C-Suite or the President can log
--   one for any manager. The day must be in this quarter (or the last 60 days, whichever reaches back further).

begin;

create or replace function public.log_past_report(p_tech uuid, p_kind text, p_day date, p_author uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_id();
  who uuid := coalesce(p_author, my_id());
  today date := (now() at time zone 'America/New_York')::date;
  q_start date := date_trunc('quarter', today)::date;
  t employees;
  rid uuid := gen_random_uuid();
begin
  if me is null then raise exception 'Sign in again.'; end if;
  if who = me then
    if not can_file_reports() then raise exception 'Only leads and managers can log reports.'; end if;
  elsif not can_manage_bonuses() then
    raise exception 'Only Ally, C-Suite or the President can log a report for someone else.';
  elsif not exists (select 1 from employees e where e.id = who and e.active and level_rank(e.level) >= 2) then
    raise exception 'Pick a lead or manager.';
  end if;
  if p_kind not in ('ride_along', 'follow_behind') then raise exception 'Pick ride-along or follow-behind.'; end if;
  if p_day is null or p_day > today or p_day < least(q_start, today - 60) then
    raise exception 'The date has to be between % and today.', to_char(least(q_start, today - 60), 'Mon DD');
  end if;
  select * into t from employees where id = p_tech and department = 'technician';
  if not found then raise exception 'Pick a technician.'; end if;
  insert into field_reports (id, kind, author_id, tech_id, office, day, answers, told_tech)
  values (rid, p_kind, who, t.id, t.office, p_day, '{"past": true}'::jsonb, true);
  return rid;
end $$;
revoke all on function public.log_past_report(uuid, text, date, uuid) from public, anon;
grant execute on function public.log_past_report(uuid, text, date, uuid) to authenticated;

-- Past reports have nothing for the tech, so they stay off the tech's home page.
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
      where r.tech_id = my_id() and r.told_tech and not coalesce((r.answers->>'past')::boolean, false)
        and r.day >= (now() at time zone 'America/New_York')::date - 90),
    'truck', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'item', t.item, 'since', t.created_at) order by t.created_at), '[]')
      from truck_issues t where t.tech_id = my_id() and t.status = 'open')
  )
$$;
revoke all on function public.my_feedback() from public, anon;
grant execute on function public.my_feedback() to authenticated;

commit;
