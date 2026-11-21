# Procare employee app: handoff notes (updated 2026-11-16)

Read this first in a new Claude Code session. It replaces the notes that lived only on John's Mac.

## Who and how to work
- John Ely, President of Procare Pest (3 Atlanta offices: East, West, South). Not technical: short, plain answers, one step and one question at a time.
- Repo `1procarepest/Procare-app`; the app is in `procare-app/` (Next.js 14 App Router, plain JS, Supabase). Vercel deploys from `main`.
- Check with `npm run build` before pushing. Commit and push only your own files; end commit messages with the Co-Authored-By line.
- **Database changes**: write a new numbered file in `supabase/changes/` (the latest is `2026-11-20-73-checkins-and-yearly-reviews.sql`, so the next is 74). Copy it to the clipboard with `LANG=en_US.UTF-8 pbcopy < file` (plain `pbcopy` from a non-UTF-8 shell garbles ’ – … · → into "‚Äô"-style text; fixed once on 2026-11-19 by `imports/2026-11-19-holiday-names-fix.sql`). John pastes it into Supabase → SQL Editor → New query → Run ("don't copy anything else first"). Confirm with a read-only query; the Supabase MCP is read-only. Run SQL before pushing app code that needs it. Keep `supabase/schema.sql`, `functions.sql` and `policies/` in step.
- Supabase cuts a request off after about 8 s. Time heavy queries on real data first.
- SQL tests run in PGlite (`@electric-sql/pglite`); there's no local Postgres. The new Mac (2026-11-16) had no Node.js or Homebrew at first.
- **UI rules from John**: use toggle switches (`app/Toggle.js`), never checkboxes. Use the brand look: `.brand-head` patterned headers, bug art from `app/Bug.js` (bugs anywhere; wildlife icons only on future wildlife pages), colors ink/forest/green/lime/sage.

## What's built (all confirmed by John)
- Profile/home: schedule, time off, today's route (techs), rep card and pay (sales), office KPIs for office staff (sales, cancels and cancel %, auto-pay %, AR 30+ %, job pool this month and past due), "Your competitions", and competition earnings with Cash out.
- Technician Performance Card `/scorecard`, Sales `/reps` (rep cards, leaderboard, work areas), Operations `/ops` (plus route plan), Pay `/pay` (sales commission, shadow mode vs Stakt), Schedule `/team`, Settings `/admin` (people, time off, issues, Prize payouts, email settings).
- **Competitions** `/compete` (changes 39-46). See `lib/competitions.js`, `lib/bracket.js`, `lib/officeKpis.js` and `lib/awards.js`.
  - Styles: leaderboard; bracket (seeding period, then elimination; people, or balanced teams made snake-style from seeding; ties go to the higher seed); office KPIs (rates scored by place 3/2/1 × weight, or by goal; Retention alone with a goal is the cancellation contest).
  - Who: person, office or custom teams; offices and teams are ranked by average per person. More than one department means company-wide, office vs office. Office on/off switches in the people list.
  - Points are set per competition. Sales reps: sale, auto-pay, pest contract-value tiers (+ to add a tier). Techs: completed services, auto-pay, reviews (5-star default), sales.
  - **Sales count only when SOLD in the competition or round.** Optional "must be serviced within N days after the end" (`points.serve_days`): until then sales are pending, after the deadline they drop off. Brackets wait N days after seeding and after each round.
  - Prize money: by place (+ to add a place) or per bracket round up to the champion's grand prize. Team prizes are split evenly. Awards are written automatically once a competition or round is final. The person cashes out, Ally (HR approver) gets an email, she marks it paid in Settings → Prize payouts, and the person gets an email. Techs and office: Ally enters it in ADP. Sales: paid as today, later through Everee.
  - Each person sees only their own department's competitions, plus any they're in or created (C-Suite and the President see all). Cards show "Created by".
  - Profile "Your competitions" (change 50, 2026-11-17): leaders also see live competitions they aren't in, tagged "Watching": the President all; leads and up their own department in their own office; extras per person in `competition_follows` (Ryan Boyd: technician + office, every office; Shelly: East technician), set on the person page by C-Suite.
  - Managers create competitions for their own department; C-Suite and the President for any.
- **Speed (2026-11-16)**: the team's first morning overloaded Supabase. `competition_board` keeps results 5 minutes (`competition_board_cache`). `rep_cards`, `tech_scorecard`, `sales_leaderboard` and `comp_sales` do the same through `rpc_cache` (change 45); the calculations are `<name>_calc`. Edits to pay plans, tech rules or excluded service types clear the saved copy.
- **2026-11-18 (change 51)**: bonus amounts are entered per quarter (stored yearly in `bonus_plans`); cancellation-rate goals leave out moving/money reasons (switches in Settings → Bonuses → Settings, `cancel_reasons_skip`); new Reservice rate goal and (change 52) Reservices (count) goal, a number to stay under, partials never count; Prize payouts can be edited or deleted (prizes back to Earnings, or gone); Settings → Time off lists upcoming approved time off with "Back to work on a day…". Scorecard leaderboard freezes the name column; only Safety keeps arrows. "PTO" now reads "paid vacation time".
- **Rep Cards (change 53)**: Team Totals start closed, leaders sit in one swipeable line, each card's history table follows the period (day: running 7 days, week: 52 weeks, month: month by month back through earlier years, year: year by year) from `rep_card_extras(grain, to)`, and "Last pins" under the name lists the cities of the rep's last 5 pins.
- **Tech incentives (2026-11-18)**: Rules page has an on/off switch per incentive (`on_<key>` in scorecard_rules; sales on unless switched off, all others off until switched on): sales, auto-pay (new, per item), completed jobs (new), completion, reservice rate (new), reviews, safety, cancels. Driving cutoff can keep sales paid (`drive_gate_keep_sales`, default on). Leaderboard has a Columns picker (saved per device).
- **Every other week (change 54)**: person page → Weekly schedule → "Every other week is different". Week A = `schedules`; week B = `schedule_alt` rows for the days that differ (null times = off); `schedule_rotations.a_week` is a week-A Monday. `lib/schedules.js` (`usualShift`, `isBWeek`) is used by the home page, team schedule and route plan.
- **Availability form (change 55)**: profile → "Update my availability" (`app/AvailabilityForm.js`, replaces sales' "Update my schedule"); time ranges only (defaults by department in `lib/availability.js`); saved in `availability_forms`. Technicians and office: emails the HR approver (Ally), who approves with "Fill in from this form" on the person page. Sales reps are contractors: "Contractor availability form" wording, `apply_sales_availability()` updates their schedule at once, email to sales managers + President, lime note on Schedule → Sales (`recent_availability_updates`).
- **People page (change 56)**: C-Suite can change their own office, level (never President) and final approval; the President's level stays greyed out. Weekly schedule times use rounded `Picker` menus (15 minutes). Time-off requests show when they were sent and how long they've waited (red after 2 days).
- **Forgot passcode (2026-11-18)**: sign-in page → "Forgot passcode?" → `app/login/send-reset` makes a Supabase recovery link (admin `generateLink`) and emails it through Resend; `/login/reset` checks it (`verifyOtp`) and saves the new passcode. Both live under /login so they work signed out.
- **Data imports** live in `supabase/imports/` (Sling time off, office hours). Before pushing, run an ESLint `no-undef` check on changed files: the build doesn't catch undefined names (that caused the 2026-11-18 home page crash).
- Sign-out only signs out the current device. Sign-in ignores a trailing space in the passcode.

- **Manager bonuses, ride-alongs and follow-behinds** (changes 47-49, live on `main` since 2026-11-16): see `BONUSES.md` for everything John agreed. `/bonus` progress, `/reports` and the two forms, Settings → Bonuses, tech feedback on the home page (`app/MyFeedback.js`). John wants to review exactly what techs see before it goes live. No photos yet (no Supabase Storage set up); customers have no street address in the app (privacy), so follow-behinds show name + city.

- **Company holidays (change 57, 2026-11-19)**: Settings → Holidays (C-Suite and President) has a switch per federal
  holiday plus Good Friday, Christmas Eve, day after Thanksgiving, day after Christmas and New Year's Eve (58 added Good Friday and day after Christmas). Dates come from `lib/holidays.js` (no weekend
  "observed" shift). On = day off for office and techs on Home, Team schedule and the Route plan (a one-day route still
  shows). Applies to everyone, sales included (John changed this 2026-11-19; reps may still choose to work; `followsHolidays` in lib/holidays.js). Starts on: Thanksgiving, Christmas Eve/Day, New Year's Eve/Day.

- **Speed (2026-11-19)**: loading.js skeleton in every section; `getMe` is shared per request (React cache) and uses
  `getClaims`; middleware uses `getClaims` and skips static files; home and team pages start their lookups in parallel.
  Change 59: `ops_suite`/`ops_snapshot` are 5-minute cached wrappers over `*_calc` (like change 45), new indexes on
  `fr_subscriptions(date_added)` and `(date_cancelled)`, and `authenticated` statement_timeout raised to 20s.

- **Payroll, sick days, year reviews (change 60, 2026-11-19, for Ally)**: Settings → Payroll (HR approver, C-Suite,
  President): approved time off per pay period (1st–15th, 16th–end; default the current one) or per year, in scheduled
  hours (`lib/payroll.js`; holidays and unscheduled days don't count), paid vacation vs unpaid, sick and called-out
  counts, Copy list. "Mark sick / called out" logs `time_off_requests.kind` = sick/called_out, approved right away
  (approvers may now insert for others). Settings → Reviews: year reviews on the G.R.E.E.N. values (`employee_reviews`,
  `can_review`: HR approver, C-Suite, President, the person's managers); shared reviews show on the person's My profile.

- **Background refresh (change 61, 2026-11-19)**: pg_cron job `procare-refresh-reports` runs `refresh_saved_reports()`
  every 10 minutes (as the President) and recalculates saved copies of ops_suite (periods reaching today/yesterday),
  ops_snapshot, rep_cards and sales_leaderboard; the wrappers treat copies as fresh for 20 minutes. Change 62 added
  tech_scorecard (its results are the same for every viewer). Operations is split into tabs: /ops (Suite, ops_suite only), /ops/accounts
  (AR & job pool, ops_snapshot only), /ops/route-plan (`app/ops/OpsTabs.js`). New heavy pages: give them a saved copy
  and add them to refresh_saved_reports().

- **Bonus management moved (2026-11-19)**: Settings → Bonuses is now Bonus → Manage bonuses (`app/bonus/manage`), a
  sub-tab beside Your goals (`app/bonus/BonusTabs.js`). /admin/bonuses forwards there (old links and approval emails).
  Bonus runners with no goals of their own go straight to Manage bonuses before the quarter loads.

## Next up (John's list)
1. ~~Manager bonuses~~: live since 2026-11-16 (changes 47–49). Setup left for Ally: Ryan as report recipient, yearly amounts, Q4 goals, past reports.
2. Inventory section (with manager bonuses), after the rest works.
3. Tech bonus payouts on the Technician Performance Card (waiting on bonus amounts and whether to use a driving-score gate; could share the Earnings box and Cash out).
4. Podium reviews credited to techs; sales pay through Everee (API enabled; token goes straight into Vercel/Supabase secrets, never into chat).
5. **Wildlife** (John, 2026-11-17 and 2026-11-19). Decided 2026-11-19: a separate **Wildlife department** (enum
   value 'wildlife', change 63a/63b). Bryan Koons and Sam Scott are Wildlife managers with **Wildlife-only access** (no
   Operations Suite, Settings or tech leaderboard; they keep route, schedule, time off). Jessica Bowles (office) handles
   Wildlife admin: `employees.wildlife_access` lets her see the Wildlife side. guard_employee keeps 'wildlife' once set
   (it otherwise derives department from the FieldRoutes employee type). Wildlife icons: `app/Critter.js`.
   - **Phase 1 (built 2026-11-19)**: /wildlife: Wildlife Performance Card (tech scorecard calc copied for the Wildlife
     department, `wildlife_scorecard`), wildlife services sold/done (`wildlife_sales`: Exclusion Service(s), Wildlife
     Warranty, Trapping, Insulation via `wildlife_line()`), both in the 10-minute background refresh.
   - **Phase 2, pay**: move the sales Pay section into the Sales app as a tab. Wildlife pay page, adjustable per person:
     full commission (defaults 10% for selling, 25% for doing the work) or salary + bonus per job; list of customers
     they sold. Referrals: FieldRoutes Sales Rep 2 (`fr_subscriptions.sold_by_2`, already synced) gets $100 when a tech
     or sales rep refers a wildlife job; the wildlife tech is Sales Rep 1. John asked about paying "as we get paid"
     (today they're paid the day the job is completed): needs FieldRoutes payments synced (Procare Sync has no payments
     table yet, only customer balance). The 25% (and the 10%) are earned when the first visit is done (John 2026-11-19). Insulation pays commission on the initial job (one-time job, no warranty or recurring part).
     **Pay rules (John 2026-11-19):** exclusion pays on the initial job only (Initial Exclusion Service / the first
     service), never warranty renewals or the recurring part; trapping pays for the entire job; Wildlife Warranty doesn't
     pay; reservices (Exclusion Reservice, Trapping Reservice) never pay and don't count as wildlife jobs (change 64).
     Every wildlife service type still counts as revenue (QuickBooks will show revenue by line item).
   - **Phase 2a built (2026-11-19, change 65)**: Wildlife → Pay (`app/wildlife/pay`, `lib/wildlifePay.js`,
     `wildlife_pay_data`): per pay period, jobs whose first visit was done, commission or salary + job bonus per person
     (`wildlife_pay_plans`, set by C-Suite/President/HR approver), referrals to pay (Sales Rep 2, `wildlife_pay_settings`).
     Sales Pay moved into the Sales app as a tab (`app/reps/pay`, `app/reps/SalesTabs.js`; /pay forwards there;
     top-bar Pay link removed), 2026-11-19. Still to do in Phase 2: referral $ on the referrer's own
     pay/earnings; "pay as we get paid" (needs payments synced).
   - **Finance built (2026-11-19, change 66)**: /finance for C-Suite and the President (app 'finance'): P&L by QuickBooks
     class (`qbo_pl_monthly`, whole months, `lib/finance.js`), Marketing cost per customer (`marketing_channels`: QuickBooks
     accounts = cost, FieldRoutes lead sources = customers; Wildlife class / wildlife customers broken out), Settings
     (connect, sync now, copy 2 years, disconnect; channel matching). QuickBooks OAuth in `lib/qbo.js` and `app/api/qbo/*`;
     tokens in `qbo_connection` (no RLS policies: server/secret key only). Daily sync: Vercel cron `/api/qbo/sync`
     (vercel.json, needs CRON_SECRET; middleware lets that GET through). Vercel env: QBO_CLIENT_ID, QBO_CLIENT_SECRET,
     QBO_ENV (production|sandbox), CRON_SECRET. Intuit app redirect URI: https://<app domain>/api/qbo/callback.
   - **Finance MFA (change 67)**: Finance needs a second sign-in step (Supabase TOTP authenticator app): /verify sets it up
     or asks for the code (`lib/mfa.js`); finance layout and /api/qbo/* require aal2; `can_see_finance()` requires
     `auth.jwt()->>'aal' = 'aal2'`. Lost phone: Supabase → Authentication → Users → remove the person's MFA factor.
   - **2026-11-19 follow-ups**: Finance defaults to Last month (QuickBooks closes monthly) with Year through last month and
     a custom month range (`pickRange` in lib/finance.js). Wildlife sales are also totaled by the customer's office
     (change 68; the tech-office comparison is hidden on /wildlife) and "done" dollars no longer use FieldRoutes'
     -1 production values. OPEN: Bryan gets almost all wildlife sales; change 68's check shows FieldRoutes' rep name
     per (office, ID) vs the app person. If they differ, FieldRoutes IDs collide across offices and `tech_fr_ids()`
     (matches by ID only, used in ~26 changes) needs to match on (office, ID).
   - **Sale credits (change 70, 2026-11-20)**: techs $100 per sale (Sales Rep 1), office $100 per "Office upsell" sale,
     wildlife referral $100 (Sales Rep 2), into Earnings when the first service is done on/after
     `pay_settings.sale_credit_start` (Nov 16); cash out needs `pay_settings.cashout_min` ($100). Change 70 ran up to
     its cron line: **pg_cron was not enabled**, so change 61's background refresh was never scheduled either.
     Fix: enable pg_cron (Supabase → Database → Extensions), run `imports/2026-11-20-enable-background-jobs.sql`; on
     payout launch day run `imports/2026-11-20-launch-sale-credits.sql`. Old prize balances: `imports/2026-11-20-clear-earnings.sql`.
   - **Ads / Google Guaranteed (change 71, 2026-11-20)**: `/ads` (Overview, Leads, Settings) for C-Suite, the
     President and `employees.ads_access` (switched on in Ads -> Settings; the ad team, no Finance). Google Ads API,
     read-only: spend by day/campaign (`gads_daily`) and Local Services leads (`gads_leads`) for every account under
     manager 100-402-6960, copied daily (`/api/gads/sync`, Vercel cron) and by Sync now. Cost per lead = spend ÷
     charged leads (credited leads drop out); cost per customer = spend ÷ new FieldRoutes customers whose lead source
     is in `ads_settings.fr_sources`. Accounts can be tied to an office. Google Cloud project "Procare App"
     (305029250433), OAuth client (Internal), redirect `/api/gads/callback`. Vercel: GADS_CLIENT_ID,
     GADS_CLIENT_SECRET, GADS_LOGIN_CUSTOMER_ID (1004026960), optional GADS_DEVELOPER_TOKEN (Google dropped the requirement in 2026), optional GADS_API_VERSION
     (default v23; Google retires versions about yearly). Access level is managed on the Cloud project: Explorer (daily limit, enough for the daily copy) as of 2026-11-20; Basic not needed yet.
   - **Ads -> Website (change 72, 2026-11-20)**: Google Analytics 4 for procarepest.com (visits by channel/source,
     top pages, key events = website leads), copied with the ads by `syncGoogle()` in `lib/ga.js`. Same Google sign-in,
     now also asking for analytics.readonly (connections made before change 72 need Disconnect + Connect once).
     Property picked in Ads -> Settings (`gads_connection.ga_property`); auto-picked when the login sees only one.
   - **Names (2026-11-20)**: the Ads app is labeled **Marketing** (routes stay `/ads`); Reports is labeled **Forms**
     (routes stay `/reports`); navigation and tab links are Title Case (John).
   - **Forms -> HR who cares (change 73, 2026-11-20)**: Ally's 6 Month Check-In and Yearly Review (`/reports/review?kind=`),
     questions in `lib/reviews.js` (CHECKIN, YEARLY), saved in `employee_reviews` (kind + answers) next to the G.R.E.E.N.
     ratings; shown in Settings -> Reviews and, once shared, on My Profile. Reviewers = HR approver, managers, C-Suite,
     President (`can_review`). The check-in shows the last ride-along feedback (`recent_field_feedback`).
   - **Phase 3, finance**: QuickBooks Online (OAuth; tokens only in secrets). Each office is a QuickBooks Class and
     Wildlife is its own Class. P&L per office and Wildlife, marketing costs, cost per customer by lead source
     (door-to-door, Google Ads/leads, Yelp, other lead services) including wildlife customers.
   - **Phase 4**: wildlife inventory, designed with item 2 (general inventory).
6. **Truck and driver sheet** (John, 2026-11-17): one place in the app to keep vehicle information up to date, so it
   no longer lives in a separate spreadsheet.
   - Each truck and who drives it, built on what's already synced: Samsara vehicles, `tech_vehicles` (tech ↔ truck,
     auto or manual) and the Samsara drivers kept by Procare Sync. A truck change here should flow to Samsara the same
     way the sync handles it today.
   - Likely fields: truck name/number, year, make, model, VIN, plate, tag renewal date, insurance, mileage (from Samsara),
     oil changes and other service, open issues (ties in with the ride-along truck items and warning lights), notes.
   - Open questions: which columns John keeps today and where (share the current sheet), who can edit (managers,
     Ryan, C-Suite?), and whether to send reminders (tag renewals, oil changes due by mileage).

## Good to know
- FieldRoutes data syncs into Supabase through the Apps Script "Procare Sync" (`sync/ProcareSync.gs`). It saves the morning route snapshot and, since change 42, a daily copy of each office's numbers (`office_kpi_days`).
- appointment.employeeID is who BOOKED the job, never the tech. A person's FieldRoutes IDs come from `tech_fr_ids()`.
- Samsara automation (2026-11-16, in Procare Sync, see `sync/README.md` steps 9–10): each active tech gets a Samsara driver
  pinned to their truck with their FieldRoutes photo, and a "Home - Name" geofence (tag Tech Homes) from their FieldRoutes
  route start address; kept in step at 7 AM and 1 PM. Managers' alerts on the Tech Homes tag (left home, not home overnight)
  are set up in Samsara. John deploys sync changes by pasting the whole file into the Apps Script project.
- To debug load problems, check Supabase logs (edge_logs 500s, postgres_logs "statement timeout").
