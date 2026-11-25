-- 92 (2026-11-25). Onboarding: training documents, sales aids and contracts (John).
--  * Everyone has an Onboarding page with what's for them: the whole company, their department, or just them
--    (e.g. a rep's own contract).
--  * C-Suite, the President and the HR approver (Ally) add, change and remove documents: PDFs and pictures (in the
--    PRIVATE onboarding-docs bucket; the app's server hands out a one-minute link) or links.
--  * Documents marked "needs sign-off" get an "I've read this" button; the date is kept. Replacing the file and
--    asking again bumps the version, so everyone signs the new one. C-Suite and Ally see who has and hasn't;
--    managers see it for the people they manage.
-- Safe to run twice.

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('onboarding-docs', 'onboarding-docs', false, 52428800)
on conflict (id) do update set public = false;

create table if not exists public.onboarding_docs (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  category      text not null default 'Training',
  kind          text not null default 'file' check (kind in ('file', 'link')),
  path          text unique,              -- in the onboarding-docs bucket (kind = file)
  file_name     text,
  mime          text,
  size          integer,
  url           text,                     -- kind = link
  departments   text[] not null default '{}',   -- empty = every department
  people        uuid[] not null default '{}',   -- not empty = only these people (overrides departments)
  needs_signoff boolean not null default false,
  version       integer not null default 1,
  sort          integer not null default 0,
  uploaded_by   uuid references public.employees(id) on delete set null default public.my_id(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.onboarding_docs enable row level security;
revoke all on public.onboarding_docs from anon, authenticated;
drop trigger if exists log_onboarding_docs on public.onboarding_docs;
create trigger log_onboarding_docs after insert or delete or update on public.onboarding_docs for each row execute function log_change();

create table if not exists public.onboarding_reads (
  doc_id      uuid not null references public.onboarding_docs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  version     integer not null,
  read_at     timestamptz not null default now(),
  primary key (doc_id, employee_id)
);
alter table public.onboarding_reads enable row level security;
revoke all on public.onboarding_reads from anon, authenticated;
drop trigger if exists log_onboarding_reads on public.onboarding_reads;
create trigger log_onboarding_reads after insert or delete or update on public.onboarding_reads for each row execute function log_change();

-- Who manages documents: C-Suite, the President and the HR approver
create or replace function public.can_manage_onboarding()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_rank() >= 4, false) or coalesce(is_hr_approver(), false)
$$;
revoke all on function public.can_manage_onboarding() from public, anon;
grant execute on function public.can_manage_onboarding() to authenticated;

-- Is a document for this person?
create or replace function public.onboarding_for(d public.onboarding_docs, e public.employees)
returns boolean language sql stable security definer set search_path = public as $$
  select e.active and case
    when cardinality(d.people) > 0 then e.id = any(d.people)
    when cardinality(d.departments) > 0 then e.department::text = any(d.departments)
    else true end
$$;
revoke all on function public.onboarding_for(public.onboarding_docs, public.employees) from public, anon;

-- Can I open this document? (the file route checks this before handing out a link)
create or replace function public.can_open_onboarding_doc(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_onboarding() or exists (
    select 1 from onboarding_docs d, employees e where d.id = p_id and e.id = my_id() and onboarding_for(d, e))
$$;
revoke all on function public.can_open_onboarding_doc(uuid) from public, anon;
grant execute on function public.can_open_onboarding_doc(uuid) to authenticated;

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
        select d.id, d.title, d.description, d.category, d.kind, d.file_name, d.mime, d.size, d.url, d.departments,
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
-- people, needs_signoff, sort, new_version }. new_version = true asks everyone to sign again.
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
    insert into onboarding_docs (title, description, category, kind, path, file_name, mime, size, url, departments, people, needs_signoff, sort)
    values (trim(p->>'title'), nullif(trim(p->>'description'), ''), coalesce(nullif(trim(p->>'category'), ''), 'Training'), k,
            case when k = 'file' then p->>'path' end, case when k = 'file' then p->>'file_name' end,
            case when k = 'file' then p->>'mime' end, case when k = 'file' then nullif(p->>'size', '')::integer end,
            case when k = 'link' then trim(p->>'url') end,
            coalesce(array(select jsonb_array_elements_text(p->'departments')), '{}'),
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

-- Remove a document; returns its storage path so the server removes the file too
create or replace function public.delete_onboarding_doc(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p text;
begin
  if not can_manage_onboarding() then raise exception 'Only C-Suite, the President and HR can remove documents.'; end if;
  delete from onboarding_docs where id = p_id returning path into p;
  return p;
end $$;
revoke all on function public.delete_onboarding_doc(uuid) from public, anon;
grant execute on function public.delete_onboarding_doc(uuid) to authenticated;

-- "I've read this" (the current version)
create or replace function public.sign_onboarding_doc(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare d onboarding_docs; e employees; t timestamptz := now();
begin
  select * into d from onboarding_docs where id = p_id;
  select * into e from employees where id = my_id();
  if d.id is null or e.id is null or not onboarding_for(d, e) then raise exception 'That document isn''t one of yours.'; end if;
  insert into onboarding_reads (doc_id, employee_id, version, read_at) values (d.id, e.id, d.version, t)
  on conflict (doc_id, employee_id) do update set version = excluded.version, read_at = excluded.read_at;
  return t;
end $$;
revoke all on function public.sign_onboarding_doc(uuid) from public, anon;
grant execute on function public.sign_onboarding_doc(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Check: the bucket, the two tables, and who can manage documents
select 'onboarding-docs bucket' as what, count(*)::text as detail from storage.buckets where id = 'onboarding-docs'
union all select 'tables', count(*)::text from information_schema.tables where table_schema = 'public' and table_name in ('onboarding_docs', 'onboarding_reads')
union all select 'can manage', string_agg(first_name || ' ' || last_name, ', ') from public.employees
  where active and (level in ('c_suite', 'president') or hr_approver);
