-- Read-only (2026-11-14): why don't emails show in the app? Changes nothing.
-- Runs the email lookup the way the app does, as the President's login.

select 'employee_contacts versions (signature / runs as owner / app can call)' as what,
  (select string_agg(concat(p.oid::regprocedure, ' / ', p.prosecdef, ' / ', has_function_privilege('authenticated', p.oid, 'execute')), ' | ')
   from pg_proc p where p.proname = 'employee_contacts') as value
union all
select 'President has a login linked', (select concat(count(*) filter (where auth_user_id is not null), ' of ', count(*)) from public.employees where level = 'president' and active)
union all
select 'emails the President gets (count)', (
  select count(*)::text from (
    select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id from public.employees where level = 'president' and active limit 1), 'role', 'authenticated')::text, true)
  ) s, public.employee_contacts() c)
union all
select 'example', (
  select concat(c.email) from (
    select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id from public.employees where level = 'president' and active limit 1), 'role', 'authenticated')::text, true)
  ) s, public.employee_contacts() c limit 1);
