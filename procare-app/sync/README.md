# Procare Sync

One Google Apps Script that copies FieldRoutes data into Supabase. Every Procare app reads
from Supabase instead of calling FieldRoutes itself, so each record is downloaded once.

- `ProcareSync.gs`: the whole script. Paste it into the Apps Script project.
- Tables it fills: `fr_*` in Supabase (see `supabase/changes/2026-11-13-7-fieldroutes-copy-tables.sql`).

## What it pulls and how often

| Data | When | How |
| --- | --- | --- |
| Subscriptions, appointments, doors | Every 15 minutes, 7 AM–10 PM Eastern | Only records changed since the last run |
| Customers (last name, auto-pay, balance) | Every 30 minutes | Only changed records; auto-pay changes are logged |
| Reviews | Every 30 minutes | Last 3 days |
| Employees, service types, cancel reasons | Every 2 hours | Full lists |
| Active customers, active services, cards on file | 7 AM and 1 PM | Full refresh |
| Samsara trucks (and matching techs to trucks) | 7 AM and 1 PM | Full list |
| Samsara safety events | Every 30 minutes | Last 3 days (picks up coaching changes) |
| Samsara safety scores | Every hour | Periods still in progress; finished periods once |

Every run is logged in `fr_sync_runs` with the number of FieldRoutes calls it used. Calls per day:

```sql
select (started_at at time zone 'America/New_York')::date as day, sum(api_calls) as calls,
       count(*) as runs, count(*) filter (where not ok) as runs_with_errors
from public.fr_sync_runs group by 1 order by 1 desc;
```

## Privacy

Customers are stored with last name (or business name) only: no first names, addresses,
phone numbers, emails, card or bank details, or note text. Doors keep a location and city
for rep work areas, and only a yes/no for whether contact info was collected. The `fr_*`
tables have no read rules yet, so signed-in people can't read them; each app adds its own.

## Setting it up

1. **Supabase:** run `supabase/changes/2026-11-13-7-fieldroutes-copy-tables.sql` in the SQL Editor.
2. **New Apps Script project:** go to script.google.com, click **New project**, and name it **Procare Sync**.
   - Replace everything in `Code.gs` with `ProcareSync.gs`.
   - **Project Settings** (gear): set **Time zone** to *(GMT-05:00) Eastern Time*.
3. **Script Properties** (Project Settings → Script Properties → Add):
   - `EAST_KEY`, `EAST_TOKEN`, `WEST_KEY`, `WEST_TOKEN`, `SOUTH_KEY`, `SOUTH_TOKEN`: copy them from the
     Operations Suite project's Script Properties (same names).
   - `FR_BASE_URL`: also from the Operations Suite (for example `https://procarepest.fieldroutes.com/api`).
   - `SUPABASE_URL`: Supabase → Project Settings → Data API (ends in `.supabase.co`).
   - `SUPABASE_SECRET_KEY`: Supabase → Project Settings → API Keys → secret key (the same one in Vercel).
   - `SAMSARA_TOKEN`: copy it from the Tech Scorecard project's Script Properties (same name).
4. **Check it:** choose `testConnections` in the function menu and click **Run**. Google asks for
   permission the first time (Advanced → Go to Procare Sync → Allow). Every line should show ✅.
5. **Check field names (optional):** run `inspectFields` and send the log; it lists field names only.
6. **Turn it on:** run `setup` (5-minute schedule), then `runBackfill`. The backfill loads everything
   since Jan 1, 2025 a few minutes at a time. Run `showStatus` to see progress. Regular syncing
   starts by itself when it's done.
7. **Samsara:** after running `supabase/changes/2026-11-13-9-samsara-tables.sql`, run `runSamsaraBackfill`
   once. It loads trucks, safety events since Jan 1, 2025, and the scorecard periods' safety scores.
   Techs are matched to trucks whose name starts with theirs (for example "Adin Sanford -118").

## Running alongside the old scripts

The Operations Suite, Tech Scorecard and Rep Cards scripts keep running until each app moves
into the employee app. Their schedules are turned off one at a time after that, which is when
the FieldRoutes call savings show up.

## If something goes wrong

- `showStatus`: backfill progress, steps waiting, and how far each office's changes are checked.
- `fr_sync_runs` in Supabase: every run's steps, call count and errors.
- A failed step is retried on the next two runs, and a failed "changes" pull never skips records.
- `resetQueue` clears stuck steps (stored data is untouched). `syncNow` runs everything that's due right now.
