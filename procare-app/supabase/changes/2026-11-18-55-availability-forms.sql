-- 2026-11-18 (change 55). Availability Form, filled out in the app instead of on paper (needs change 54).
-- Each submission is kept on the person (their file).
--   Technicians and office: Ally (HR approver) gets an email, approves it, and fills the schedule from it.
--   Sales reps (contractors): apply_sales_availability() updates their schedule right away; the sales managers
--   and the President get a note.
--   days: { "1": { "a": {"kind": "hours" | "off", "s": "08:45", "e": "14:00"},          a = this week
--                  "b": same shape or null }, … "6" }   b = next week, then every other week. 1 Monday … 6 Saturday
begin;

create table if not exists public.availability_forms (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  location     text,
  position     text,
  days         jsonb not null,
  notes        text,
  signature    text not null check (length(trim(signature)) > 1),
  submitted_at timestamptz not null default now(),
  applied_at   timestamptz,                              -- when the schedule was set from it
  applied_by   uuid references public.employees(id) on delete set null
);
create index if not exists availability_forms_person on public.availability_forms (employee_id, submitted_at desc);

alter table public.availability_forms enable row level security;
-- You fill out your own.
drop policy if exists availability_forms_insert on public.availability_forms;
create policy availability_forms_insert on public.availability_forms for insert to authenticated
  with check (employee_id = my_id());
-- You, your managers, schedule editors and HR see them.
drop policy if exists availability_forms_read on public.availability_forms;
create policy availability_forms_read on public.availability_forms for select to authenticated
  using (employee_id = my_id() or can_manage(employee_id) or can_edit_schedule(employee_id) or is_hr_approver());
-- Schedule editors and HR mark them as entered.
drop policy if exists availability_forms_update on public.availability_forms;
create policy availability_forms_update on public.availability_forms for update to authenticated
  using (can_edit_schedule(employee_id) or is_hr_approver())
  with check (can_edit_schedule(employee_id) or is_hr_approver());

drop trigger if exists log_availability_forms on public.availability_forms;
create trigger log_availability_forms after insert or delete or update on public.availability_forms
  for each row execute function log_change();

insert into public.notification_settings (key, label, enabled) values
  ('availability_form', 'Availability form filled out: email the HR approver (Ally) to approve it; sales: note to the sales managers and the President', true)
on conflict (key) do update set label = excluded.label;

-- Sales reps (contractors): their own form updates their schedule right away, Monday – Saturday (Sunday stays).
-- Every-other-week days: this week is week A (change 54). Returns true when it applied.
create or replace function public.apply_sales_availability(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  f availability_forms;
  wk date := date_trunc('week', (now() at time zone 'America/New_York'))::date;
  d int;
  a jsonb;
  b jsonb;
begin
  select * into f from availability_forms where id = p_id;
  if f.id is null or f.employee_id <> my_id() or f.applied_at is not null then return false; end if;
  if not exists (select 1 from employees where id = f.employee_id and department = 'sales') then return false; end if;
  for d in 1..6 loop
    a := f.days -> d::text -> 'a';
    b := f.days -> d::text -> 'b';
    if a ->> 'kind' = 'hours' and (a ->> 's') < (a ->> 'e') then
      insert into schedules (employee_id, weekday, start_time, end_time) values (f.employee_id, d, (a ->> 's')::time, (a ->> 'e')::time)
      on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time;
    elsif a is not null then
      delete from schedules where employee_id = f.employee_id and weekday = d;
    end if;
    if b is null or jsonb_typeof(b) = 'null' then
      delete from schedule_alt where employee_id = f.employee_id and weekday = d;
    elsif b ->> 'kind' = 'hours' and (b ->> 's') < (b ->> 'e') then
      insert into schedule_alt (employee_id, weekday, start_time, end_time) values (f.employee_id, d, (b ->> 's')::time, (b ->> 'e')::time)
      on conflict (employee_id, weekday) do update set start_time = excluded.start_time, end_time = excluded.end_time;
    else
      insert into schedule_alt (employee_id, weekday, start_time, end_time) values (f.employee_id, d, null, null)
      on conflict (employee_id, weekday) do update set start_time = null, end_time = null;
    end if;
  end loop;
  if exists (select 1 from schedule_alt where employee_id = f.employee_id) then
    insert into schedule_rotations (employee_id, a_week) values (f.employee_id, wk)
    on conflict (employee_id) do update set a_week = excluded.a_week, updated_at = now();
  else
    delete from schedule_rotations where employee_id = f.employee_id;
  end if;
  update availability_forms set applied_at = now(), applied_by = f.employee_id where id = p_id;
  return true;
end $$;
revoke all on function public.apply_sales_availability(uuid) from public, anon;
grant execute on function public.apply_sales_availability(uuid) to authenticated;

-- Recent sales availability updates, for the note on the team schedule (sales managers and up).
create or replace function public.recent_availability_updates(p_days int default 14)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name, 'at', f.submitted_at)
                            order by f.submitted_at desc), '[]')
  from availability_forms f join employees e on e.id = f.employee_id
  where e.department = 'sales' and f.applied_at is not null and f.submitted_at > now() - make_interval(days => least(greatest(p_days, 1), 60))
    and (my_rank() >= 4 or (my_department() = 'sales' and my_rank() >= 3))
$$;
revoke all on function public.recent_availability_updates(int) from public, anon;
grant execute on function public.recent_availability_updates(int) to authenticated;

commit;
