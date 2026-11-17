# Procare Sync

One Google Apps Script that copies FieldRoutes data into Supabase. Every Procare app reads
from Supabase instead of calling FieldRoutes itself, so each record is downloaded once.

- `ProcareSync.gs`: the whole script. Paste it into the Apps Script project.
- Tables it fills: `fr_*` in Supabase (see `supabase/changes/2026-11-13-7-fieldroutes-copy-tables.sql`).

## What it pulls and how often

| Data | When | How |
| --- | --- | --- |
| Subscriptions, appointments, doors | Every 15 minutes, 7 AM–10 PM Eastern | Only records changed since the last run |
| Customers (name, auto-pay, balance) | Every 30 minutes | Only changed records; auto-pay changes are logged |
| Reviews | Every 30 minutes | Last 3 days |
| Employees, service types, cancel reasons | Every 2 hours | Full lists |
| Active customers, active services, cards on file | 7 AM and 1 PM | Full refresh |
| Samsara trucks and drivers (and matching techs to them) | 7 AM and 1 PM | Full lists |
| Samsara safety events | Every 30 minutes | Last 3 days (picks up coaching changes) |
| Samsara safety scores (per driver and per truck) | Every hour | Periods still in progress; finished periods once |

Every run is logged in `fr_sync_runs` with the number of FieldRoutes calls it used. Calls per day:

```sql
select (started_at at time zone 'America/New_York')::date as day, sum(api_calls) as calls,
       count(*) as runs, count(*) filter (where not ok) as runs_with_errors
from public.fr_sync_runs group by 1 order by 1 desc;
```

## Privacy

Customers are stored with first and last name (or business name) only: no addresses,
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
8. **Samsara drivers** (after `supabase/changes/2026-11-13-11-samsara-drivers.sql`): each tech is also
   linked to their Samsara driver: by a FieldRoutes ID in the driver's external IDs, otherwise by exact
   full name, or by the driver ID on their person record (that one always wins). Once linked, the tech's
   score is their driver score (`tech_safety_scores`), which follows them across trucks. Techs with no
   driver yet keep their truck's score. `supabase/checks/samsara-drivers.sql` shows who is on which.
9. **Create Samsara drivers automatically** (needs the Samsara token's write access to Drivers): run
   `previewSamsaraDrivers`. It lists every change and makes none in Samsara:
   - CREATE: an active tech with a truck but no Samsara driver gets one, pinned to their truck
     (username = their email before the @; a random password nobody knows; their FieldRoutes ID saved on the driver).
   - REACTIVATE: their Samsara driver was deactivated (a rehire).
   - MOVE TRUCK: their driver is pinned to a different truck than the app has for them.
   - DEACTIVATE: the tech was deactivated in the app.
   - PHOTO: their driver has no photo in Samsara, so it gets the app's (FieldRoutes) photo. New drivers get it when created.
     A photo already in Samsara is never replaced. If Samsara won't take a photo, the run lists it and carries on.
   - SKIP: no truck name starts with their name. Rename the truck in Samsara (e.g. "First Last - 214") or set it on their record.
   If it looks right, run `turnOnSamsaraDrivers`: it makes those changes, then repeats at 7 AM and 1 PM.
   The first run is the backfill. `turnOffSamsaraDrivers` stops it. Only technicians' drivers are ever
   changed. It stops without changing anything if more than 60 creates or 5 deactivations come up at once.
   Past safety events stay unassigned in Samsara; new ones land on the driver.
10. **Home geofences** (needs the Samsara token's read and write access to Addresses): run `previewHomeGeofences`.
   Each active tech's home from FieldRoutes (their address, else their route start, else route end address; linked profiles
   and profiles with the same email count as theirs) becomes a Samsara
   address "Home - First Last" with a 100 m circle, tagged **Tech homes**. The log shows city and ZIP only.
   The token can't create tags: make a tag named **Tech homes** once in Samsara (Settings → Tags), and the next run
   tags every home geofence (TAG lines).
   - CREATE / MOVE (their FieldRoutes address changed) / REMOVE (deactivated in the app) / SKIP (no address in FieldRoutes).
   - ⚠ SAME ADDRESS: two techs have the exact same address. Often an office used as a route start; fix it in FieldRoutes
     before turning this on, or the geofence will sit on the office.
   If it looks right, run `turnOnHomeGeofences`; it repeats at 7 AM and 1 PM. `turnOffHomeGeofences` stops it.
   Change a tech's address in FieldRoutes, not in Samsara: the next run moves the geofence. Home addresses are never
   stored in the app. Only addresses this sync made (they carry the tech's FieldRoutes ID) are ever changed.
   Then in Samsara → Alerts, set alerts on the Tech homes tag: geofence exit in the morning ("left home") and
   "not inside geofence" overnight ("never went home").

## Team list (new hires and people who leave)

After running `supabase/changes/2026-11-13-12-team-from-fieldroutes.sql`:

1. Run `previewTeamSync`. It lists who would be added, deactivated or reactivated, and changes nothing.
2. If the list looks right, run `turnOnTeamSync`. It makes those changes, then repeats after every
   employee list pull (every 2 hours). `turnOffTeamSync` stops it.

Rules: new hires (active in FieldRoutes, not in the app) are added as team members with no login.
People inactive in FieldRoutes in every office are deactivated; the President and C-Suite never are.
Someone deactivated in the app stays deactivated even if FieldRoutes still has them active.
If a run would deactivate more than 15% of the team at once, it stops and changes nothing.

## Running alongside the old scripts

The Operations Suite, Tech Scorecard and Rep Cards scripts keep running until each app moves
into the employee app. Their schedules are turned off one at a time after that, which is when
the FieldRoutes call savings show up.

## If something goes wrong

- `showStatus`: backfill progress, steps waiting, and how far each office's changes are checked.
- `fr_sync_runs` in Supabase: every run's steps, call count and errors.
- A failed step is retried on the next two runs, and a failed "changes" pull never skips records.
- `resetQueue` clears stuck steps (stored data is untouched). `syncNow` runs everything that's due right now.
- `fillMissingInitials` fetches, once, every sale's first appointment the app is missing (cancelled or rescheduled ones, which FieldRoutes' searches leave out). After that the sync checks for new ones every 2 hours with the lists (step `initials`). Needs change 27 in Supabase.

First names (added 2026-11-15, change 36) are shown only to the rep who sold the customer and to
pay managers, on the pay statement. Tech routes still show last names only.
