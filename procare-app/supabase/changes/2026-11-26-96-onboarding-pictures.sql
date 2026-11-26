-- 96 (2026-11-26). Onboarding: a picture on each card (John), so people can see what a document is at a glance.
--  * onboarding_docs.thumb_path: a small picture in the onboarding-docs bucket (made in the browser when a PDF or
--    picture is uploaded: the PDF's first page, or the picture itself; or one uploaded by hand).
--  * onboarding_docs.thumb_url: for links, the website's own preview image (its og:image), found by the app's server.
--  * set_onboarding_thumb: C-Suite, the President and HR set or clear it; returns the old picture's path so the
--    server removes it.
-- Safe to run twice.

begin;

alter table public.onboarding_docs add column if not exists thumb_path text;
alter table public.onboarding_docs add column if not exists thumb_url text;

create or replace function public.set_onboarding_thumb(p_id uuid, p_path text, p_url text)
returns text language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not can_manage_onboarding() then raise exception 'Only C-Suite, the President and HR can change Onboarding.'; end if;
  if p_path is not null and p_path not like 'docs/%' then raise exception 'That picture isn''t in the Onboarding folder.'; end if;
  if p_url is not null and p_url !~* '^https?://' then raise exception 'The picture link has to start with https://'; end if;
  select thumb_path into old from onboarding_docs where id = p_id;
  update onboarding_docs set thumb_path = p_path, thumb_url = p_url where id = p_id;
  return case when old is distinct from p_path then old end;
end $$;
revoke all on function public.set_onboarding_thumb(uuid, text, text) from public, anon;
grant execute on function public.set_onboarding_thumb(uuid, text, text) to authenticated;

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
               (d.thumb_path is not null or d.thumb_url is not null) as has_thumb,
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

commit;

notify pgrst, 'reload schema';

-- Check: the two picture columns
select 'picture columns' as what, count(*)::text as detail from information_schema.columns
where table_schema = 'public' and table_name = 'onboarding_docs' and column_name in ('thumb_path', 'thumb_url');
