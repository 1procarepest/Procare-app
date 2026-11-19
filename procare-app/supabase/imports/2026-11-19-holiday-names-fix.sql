-- 2026-11-19. Fix text garbled on the way into Supabase: the Mac clipboard (copied without a UTF-8 setting)
-- turned curly apostrophes, dashes, dots and arrows into odd characters, e.g. "New Year,Aos Day".
-- 1) Fixes every saved text value in the app's tables (holiday names, email-setting labels, time-off notes, ...).
-- 2) Lists database functions whose messages are garbled, so they can be saved again.
-- This file is plain ASCII on purpose: chr() spells out each character.
-- Only these exact garbled sequences are replaced, and they never appear in normal text.

begin;

create temp table if not exists fix_pairs (bad text, good text);
truncate fix_pairs;
insert into fix_pairs values
  (chr(8218) || chr(196) || chr(244), chr(8217)),   -- curly apostrophe
  (chr(8218) || chr(196) || chr(242), chr(8216)),   -- opening single quote
  (chr(8218) || chr(196) || chr(250), chr(8220)),   -- opening double quote
  (chr(8218) || chr(196) || chr(249), chr(8221)),   -- closing double quote
  (chr(8218) || chr(196) || chr(236), chr(8211)),   -- en dash
  (chr(8218) || chr(196) || chr(238), chr(8212)),   -- em dash
  (chr(8218) || chr(196) || chr(182), chr(8230)),   -- ellipsis
  (chr(8218) || chr(220) || chr(237), chr(8594)),   -- right arrow
  (chr(8218) || chr(220) || chr(234), chr(8592)),   -- left arrow
  (chr(172) || chr(8721), chr(183)),                -- middle dot
  (chr(8218) || chr(224) || chr(237), chr(8722));   -- minus sign

create temp table fix_log (tbl text, col text, rows_fixed bigint);

do $$
declare
  c record;
  n bigint;
  expr text;
  p record;
begin
  for c in
    select t.table_name, t.column_name
    from information_schema.columns t
    join information_schema.tables b on b.table_schema = t.table_schema and b.table_name = t.table_name
    where t.table_schema = 'public' and b.table_type = 'BASE TABLE'
      and t.data_type in ('text', 'character varying')
      and t.table_name <> 'activity_log'
  loop
    expr := format('%I', c.column_name);
    for p in select bad, good from fix_pairs loop
      expr := format('replace(%s, %L, %L)', expr, p.bad, p.good);
    end loop;
    execute format('update public.%I set %I = %s where %I ~ %L',
                   c.table_name, c.column_name, expr, c.column_name,
                   '(' || chr(8218) || '[' || chr(196) || chr(220) || chr(224) || ']|' || chr(172) || chr(8721) || ')');
    get diagnostics n = row_count;
    if n > 0 then insert into fix_log values (c.table_name, c.column_name, n); end if;
  end loop;
end $$;

commit;

-- Check: what was fixed, then any functions that still have garbled messages (send this list to Claude)
select 'Fixed: ' || tbl || '.' || col as what, rows_fixed::text as detail from fix_log
union all
select 'Function to re-save', p.proname
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public'
  and p.prosrc ~ ('(' || chr(8218) || '[' || chr(196) || chr(220) || chr(224) || ']|' || chr(172) || chr(8721) || ')')
union all
select 'Holiday', name from public.company_holidays where key in ('new_years_day', 'new_years_eve', 'presidents_day');
