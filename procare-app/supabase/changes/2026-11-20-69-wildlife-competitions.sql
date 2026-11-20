-- 69 (2026-11-20). Competitions can be for the Wildlife department (John: Wildlife as its own pick, with the
-- people toggles). Wildlife scores like technicians: completed services, reviews, auto-pay and sales, matched by
-- each person's FieldRoutes IDs. Bryan and Sam (Wildlife managers) can run Wildlife competitions; C-Suite and the
-- President can run any. Safe to run twice.

begin;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.competitions'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%departments%' loop
    execute format('alter table public.competitions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.competitions add constraint competitions_departments_check
  check (cardinality(departments) > 0 and departments <@ array['technician', 'sales', 'administrative', 'wildlife']);

commit;

select pg_get_constraintdef(oid) as departments_allowed from pg_constraint
where conrelid = 'public.competitions'::regclass and conname = 'competitions_departments_check';
