-- 63a (2026-11-19). Step 1 of 2: adds 'wildlife' to the list of departments. Run this on its own first
-- (Postgres needs a new department name saved before anything can use it), then run 63b.
alter type public.department add value if not exists 'wildlife';

select 'Wildlife department added. Now run 63b.' as next_step;
