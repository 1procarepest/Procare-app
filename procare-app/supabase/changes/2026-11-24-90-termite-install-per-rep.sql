-- 90 (2026-11-24). Termite install pay per rep (John): each rep's plan can set their own share of a termite
-- sale's initial (install) price, e.g. Logan Woods 100% while others get 50%. Blank = the company setting
-- (Plans → Commission plan → Termite initial payout). It now applies to Flat rate reps too, on top of the flat
-- termite amount, paid the same Monday.
-- Nothing is switched on here: set the company % and each rep's % in Sales → Pay → Plans.
-- Safe to run twice.
begin;

alter table public.comp_assignments add column if not exists termite_initial_pct numeric
  check (termite_initial_pct between 0 and 100);
comment on column public.comp_assignments.termite_initial_pct is
  'Share of a termite sale''s initial price paid up front to this rep (0-100). Null = comp_settings.termite_initial_pct.';

commit;
notify pgrst, 'reload schema';

-- Saved pay copies are cleared automatically when plans change (change 45); clear them once now too
delete from public.rpc_cache where fn = 'comp_sales';

-- Check: the new column, and today's company setting (Flat rate reps start getting this share too)
select 'comp_assignments.termite_initial_pct' as what, count(*)::text as detail from information_schema.columns
  where table_schema = 'public' and table_name = 'comp_assignments' and column_name = 'termite_initial_pct'
union all
select 'company termite install %', termite_initial_pct::text from public.comp_settings where id = 1;
