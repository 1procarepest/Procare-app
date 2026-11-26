-- 95 (2026-11-26). Onboarding: send a document (or test) to certain offices, as well as departments (John: managers
-- want their own team to go over some documents, e.g. Technicians in Atlanta East).
--  * onboarding_docs.offices and onboarding_quizzes.offices: empty = every office. Departments and offices combine:
--    "Technician" + "Atlanta East" = technicians in Atlanta East. "Certain people" still wins over both.
-- Safe to run twice.

begin;

alter table public.onboarding_docs add column if not exists offices text[] not null default '{}';
alter table public.onboarding_quizzes add column if not exists offices text[] not null default '{}';

-- Is a document for this person? (people; else department and office, each blank = all)
create or replace function public.onboarding_for(d public.onboarding_docs, e public.employees)
returns boolean language sql stable security definer set search_path = public as $$
  select e.active and case
    when cardinality(d.people) > 0 then e.id = any(d.people)
    else (cardinality(d.departments) = 0 or e.department::text = any(d.departments))
     and (cardinality(d.offices) = 0 or e.office::text = any(d.offices))
    end
$$;
revoke all on function public.onboarding_for(public.onboarding_docs, public.employees) from public, anon;

create or replace function public.quiz_for(z public.onboarding_quizzes, e public.employees)
returns boolean language sql stable security definer set search_path = public as $$
  select e.active and z.active and case
    when cardinality(z.people) > 0 then e.id = any(z.people)
    else (cardinality(z.departments) = 0 or e.department::text = any(z.departments))
     and (cardinality(z.offices) = 0 or e.office::text = any(z.offices))
    end
$$;
revoke all on function public.quiz_for(public.onboarding_quizzes, public.employees) from public, anon;

-- The page: my documents and what I've signed; for managers, sign-off status for the people they can see
create or replace function public.onboarding_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me_id uuid := my_id();
  boss boolean := can_manage_onboarding();
  result jsonb;
begin
  if me_id is null then return null; end if;
  select jsonb_build_object(
    'can_manage', boss,
    'docs', (select coalesce(jsonb_agg(x order by x.category, x.sort, x.title), '[]') from (
        select d.id, d.title, d.description, d.category, d.kind, d.file_name, d.mime, d.size, d.url, d.departments, d.offices,
               d.needs_signoff, d.version, d.sort, d.updated_at,
               case when boss then d.people else '{}' end as people, case when boss then d.path end as path,
               onboarding_for(d, me) as mine,
               r.read_at, (r.version = d.version) as signed
        from onboarding_docs d
        join employees me on me.id = me_id
        left join onboarding_reads r on r.doc_id = d.id and r.employee_id = me_id
        where boss or onboarding_for(d, me)) x),
    -- Sign-off status: every sign-off document, with each person it's for whom I may see
    'signoffs', (select coalesce(jsonb_agg(s order by s.title), '[]') from (
        select d.id, d.title, d.version,
               (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', e.id, 'name', e.first_name || ' ' || e.last_name, 'office', e.office,
                          'department', e.department, 'read_at', case when r.version = d.version then r.read_at end,
                          'old', r.version is not null and r.version <> d.version)
                        order by (r.version = d.version) nulls first, e.first_name, e.last_name), '[]')
                from employees e left join onboarding_reads r on r.doc_id = d.id and r.employee_id = e.id
                where onboarding_for(d, e) and e.id <> me_id and (boss or can_manage(e.id))) as people
        from onboarding_docs d where d.needs_signoff) s),
    'people', case when boss then (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name,
                 'office', e.office, 'department', e.department) order by e.first_name, e.last_name), '[]')
               from employees e where e.active) end
  ) into result;
  return result;
end $$;
revoke all on function public.onboarding_data() from public, anon;
grant execute on function public.onboarding_data() to authenticated;

-- Add or change a document. p: { title, description, category, kind, path, file_name, mime, size, url, departments,
-- offices, people, needs_signoff, sort, new_version }. new_version = true asks everyone to sign again.
create or replace function public.save_onboarding_doc(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; k text := coalesce(nullif(p->>'kind', ''), 'file');
begin
  if not can_manage_onboarding() then raise exception 'Only C-Suite, the President and HR can change Onboarding.'; end if;
  if coalesce(trim(p->>'title'), '') = '' then raise exception 'Give it a title.'; end if;
  if k = 'link' and coalesce(p->>'url', '') !~* '^https?://' then raise exception 'The link has to start with https://'; end if;
  if k = 'file' and p ? 'path' and p->>'path' is not null and p->>'path' not like 'docs/%' then raise exception 'That file isn''t in the Onboarding folder.'; end if;
  if p_id is null then
    if k = 'file' and coalesce(p->>'path', '') = '' then raise exception 'Pick a file to upload.'; end if;
    insert into onboarding_docs (title, description, category, kind, path, file_name, mime, size, url, departments, offices, people, needs_signoff, sort)
    values (trim(p->>'title'), nullif(trim(p->>'description'), ''), coalesce(nullif(trim(p->>'category'), ''), 'Training'), k,
            case when k = 'file' then p->>'path' end, case when k = 'file' then p->>'file_name' end,
            case when k = 'file' then p->>'mime' end, case when k = 'file' then nullif(p->>'size', '')::integer end,
            case when k = 'link' then trim(p->>'url') end,
            coalesce(array(select jsonb_array_elements_text(p->'departments')), '{}'),
            coalesce(array(select jsonb_array_elements_text(p->'offices')), '{}'),
            coalesce(array(select jsonb_array_elements_text(p->'people'))::uuid[], '{}'),
            coalesce((p->>'needs_signoff')::boolean, false), coalesce(nullif(p->>'sort', '')::integer, 0))
    returning id into v;
  else
    update onboarding_docs set
      title = trim(p->>'title'), description = nullif(trim(p->>'description'), ''),
      category = coalesce(nullif(trim(p->>'category'), ''), 'Training'), kind = k,
      path = case when k = 'link' then null when coalesce(p->>'path', '') <> '' then p->>'path' else path end,
      file_name = case when k = 'link' then null when coalesce(p->>'path', '') <> '' then p->>'file_name' else file_name end,
      mime = case when k = 'link' then null when coalesce(p->>'path', '') <> '' then p->>'mime' else mime end,
      size = case when k = 'link' then null when coalesce(p->>'path', '') <> '' then nullif(p->>'size', '')::integer else size end,
      url = case when k = 'link' then trim(p->>'url') end,
      departments = coalesce(array(select jsonb_array_elements_text(p->'departments')), '{}'),
      offices = coalesce(array(select jsonb_array_elements_text(p->'offices')), '{}'),
      people = coalesce(array(select jsonb_array_elements_text(p->'people'))::uuid[], '{}'),
      needs_signoff = coalesce((p->>'needs_signoff')::boolean, false),
      sort = coalesce(nullif(p->>'sort', '')::integer, sort),
      version = version + case when coalesce((p->>'new_version')::boolean, false) then 1 else 0 end,
      updated_at = now()
    where id = p_id returning id into v;
    if v is null then raise exception 'That document is gone.'; end if;
  end if;
  return v;
end $$;
revoke all on function public.save_onboarding_doc(uuid, jsonb) from public, anon;
grant execute on function public.save_onboarding_doc(uuid, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Check: both tables have the offices column
select 'offices columns' as what, count(*)::text as detail from information_schema.columns
where table_schema = 'public' and table_name in ('onboarding_docs', 'onboarding_quizzes') and column_name = 'offices';
