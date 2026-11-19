# Procare employee app: handoff notes (updated 2026-11-16)

Read this first in a new Claude Code session. It replaces the notes that lived only on John's Mac.

## Who and how to work
- John Ely, President of Procare Pest (3 Atlanta offices: East, West, South). Not technical: short, plain answers, one step and one question at a time.
- Repo `1procarepest/Procare-app`; the app is in `procare-app/` (Next.js 14 App Router, plain JS, Supabase). Vercel deploys from `main`.
- Check with `npm run build` before pushing. Commit and push only your own files; end commit messages with the Co-Authored-By line.
- **Database changes**: write a new numbered file in `supabase/changes/` (the latest is `2026-11-18-55-availability-forms.sql`, so the next is 56). Copy it to the clipboard (`pbcopy` on a Mac). John pastes it into Supabase → SQL Editor → New query → Run ("don't copy anything else first"). Confirm with a read-only query; the Supabase MCP is read-only. Run SQL before pushing app code that needs it. Keep `supabase/schema.sql`, `functions.sql` and `policies/` in step.
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
- **Data imports** live in `supabase/imports/` (Sling time off, office hours). Before pushing, run an ESLint `no-undef` check on changed files: the build doesn't catch undefined names (that caused the 2026-11-18 home page crash).
- Sign-out only signs out the current device. Sign-in ignores a trailing space in the passcode.

- **Manager bonuses, ride-alongs and follow-behinds** (changes 47-49, live on `main` since 2026-11-16): see `BONUSES.md` for everything John agreed. `/bonus` progress, `/reports` and the two forms, Settings → Bonuses, tech feedback on the home page (`app/MyFeedback.js`). John wants to review exactly what techs see before it goes live. No photos yet (no Supabase Storage set up); customers have no street address in the app (privacy), so follow-behinds show name + city.

## Next up (John's list)
1. ~~Manager bonuses~~: live since 2026-11-16 (changes 47–49). Setup left for Ally: Ryan as report recipient, yearly amounts, Q4 goals, past reports.
2. Inventory section (with manager bonuses), after the rest works.
3. Tech bonus payouts on the Technician Performance Card (waiting on bonus amounts and whether to use a driving-score gate; could share the Earnings box and Cash out).
4. Podium reviews credited to techs; sales pay through Everee (API enabled; token goes straight into Vercel/Supabase secrets, never into chat).
5. **Wildlife section** (John, 2026-11-17). The wildlife team (today Samuel Scott and Bryan Koons) is split out from regular
   team members.
   - **Access:** two new roles, wildlife manager and wildlife team leader. Both see everything a team member sees, plus a
     Wildlife section. Today both men would be wildlife managers; the two roles matter as the team grows. Likely an extra
     "wildlife" access marker on the person (department or flag) rather than a whole new department, so they keep their
     technician pages, scorecard and Samsara setup.
   - **Wildlife P&L:** revenue and direct costs from QuickBooks, plus the overhead that belongs to the wildlife department.
     Needs a QuickBooks Online connection (OAuth; tokens go straight into secrets, never into chat). Easiest if wildlife is
     its own Class or Location in QuickBooks. Overhead split is the tricky part: agree with John how shared costs are
     divided (e.g. by revenue share, headcount or a fixed %).
   - **Wildlife inventory:** they keep a separate inventory system; give them a page in the Wildlife section to update it.
     Plan alongside item 2 (general inventory) so the two share one design.
   - Wildlife icons already exist in `public/icons/wildlife` (reserved for these pages).
   - Open questions: how QuickBooks tracks wildlife today (Class, Location, separate accounts?), what the wildlife
     inventory holds and where it lives now, and who else may see the Wildlife P&L (C-Suite, President, Ally?).
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
