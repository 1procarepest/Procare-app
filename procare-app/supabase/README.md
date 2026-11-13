# Supabase database rules

A copy of how the Procare Team app's database is set up: tables, permission
rules and helper functions. The real setup lives in Supabase. **The app never
runs these files.** They're here so the rules are written down, show up in
GitHub history, and can be rebuilt if needed.

Exported 2026-11-13, then updated by hand for that day's later changes.

## What's here

| File | What it holds |
| --- | --- |
| `schema.sql` | Types, tables, columns and constraints |
| `functions.sql` | Helper functions (`my_id`, `can_manage`, `can_approve_time_off`, …) and trigger functions |
| `policies/<table>.sql` | One file per table: its row level security rules and triggers |
| `changes/` | One-time scripts that were run in Supabase, in date order, kept for history |

Every table has row level security on, so a signed-in person only sees and
changes what the rules allow. Supabase also switches it on automatically for any
new table (`rls_auto_enable`), which means a new table is locked until it has rules.

## Who can do what (summary)

- **President**: everything, including their own time off and schedule issues.
- **C-Suite**: everything except President accounts.
- **Managers**: their department in every office (team members and leads).
- **Leads**: team members in their department and office.
- **Time off approval**: sales requests go to a sales manager or the President;
  everyone else's go to the HR approver (Ally Boyd) or the President.
- **Schedules**: sales schedules can be changed by the person, a sales manager or
  the President; everyone else's by whoever manages them.
- **Home addresses** (`employee_private`): C-Suite, the President, office managers,
  and office leads for their own office.
- **Email and phone**: team members see only their own; leads and up see
  everyone's (through `employee_contacts()`; the columns can't be read directly).
- **Schedule issues**: managers resolve their team's; the President can resolve
  their own. The database records who resolved each one.
- **Activity log**: every change to every table is recorded; C-Suite and the
  President can read it.

## Changing a rule

1. Write the change as SQL and run it in Supabase → **SQL Editor** inside
   `begin; … commit;`, so nothing is saved if any part fails.
2. Check it took (for example, `select * from pg_policies where tablename = '…';`).
3. Update the matching file here and add a line to its **History** comment.
4. Commit and push, so GitHub matches the database.

## Re-exporting

To check these files still match Supabase, run the export query again in the
SQL Editor. Supabase shows at most 100 rows at a time, so run it once as is and
once more with `offset 100` added to the last line.

```sql
select kind, name, detail from (
  select '1 table' as kind, c.relname as name,
         'row level security ' || case when c.relrowsecurity then 'on' else 'OFF' end as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  union all
  select '2 column', table_name || '.' || column_name,
         data_type || case when is_nullable = 'NO' then ' not null' else '' end
         || coalesce(' default ' || column_default, '')
  from information_schema.columns where table_schema = 'public'
  union all
  select '3 constraint', con.conrelid::regclass::text || '.' || con.conname, pg_get_constraintdef(con.oid)
  from pg_constraint con join pg_namespace n on n.oid = con.connamespace
  where n.nspname = 'public'
  union all
  select '4 type', t.typname, string_agg(e.enumlabel, ', ' order by e.enumsortorder)
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname
  union all
  select '5 policy', tablename || '.' || policyname,
         'for ' || cmd || ' to ' || array_to_string(roles, ', ')
         || coalesce(' using (' || qual || ')', '') || coalesce(' with check (' || with_check || ')', '')
  from pg_policies where schemaname = 'public'
  union all
  select '6 trigger', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
  union all
  select '7 function', p.proname, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
) everything
order by kind, name;
```

Not covered by the export: the trigger on `auth.users` that calls
`link_auth_user()`, and settings in the Supabase dashboard (Auth, API keys,
email). Secrets never go in this repo; they're set in Vercel.
