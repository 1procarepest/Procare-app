# Procare employee app: handoff notes (updated 2026-11-16)

Read this first in a new Claude Code session. It replaces the notes that lived only on John's Mac.

## Who and how to work
- John Ely, President of Procare Pest (3 Atlanta offices: East, West, South). Not technical: short, plain answers, one step and one question at a time.
- Repo `1procarepest/Procare-app`; the app is in `procare-app/` (Next.js 14 App Router, plain JS, Supabase). Vercel deploys from `main`.
- Check with `npm run build` before pushing. Commit and push only your own files; end commit messages with the Co-Authored-By line.
- **Database changes**: write a new numbered file in `supabase/changes/` (the latest is `2026-11-16-49-past-reports.sql`, so the next is 50). Copy it to the clipboard (`pbcopy` on a Mac). John pastes it into Supabase → SQL Editor → New query → Run ("don't copy anything else first"). Confirm with a read-only query; the Supabase MCP is read-only. Run SQL before pushing app code that needs it. Keep `supabase/schema.sql`, `functions.sql` and `policies/` in step.
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
  - Managers create competitions for their own department; C-Suite and the President for any.
- **Speed (2026-11-16)**: the team's first morning overloaded Supabase. `competition_board` keeps results 5 minutes (`competition_board_cache`). `rep_cards`, `tech_scorecard`, `sales_leaderboard` and `comp_sales` do the same through `rpc_cache` (change 45); the calculations are `<name>_calc`. Edits to pay plans, tech rules or excluded service types clear the saved copy.
- Sign-out only signs out the current device. Sign-in ignores a trailing space in the passcode.

- **Manager bonuses, ride-alongs and follow-behinds** (changes 47-49, branch `manager-bonuses`, NOT merged or live yet): see `BONUSES.md` for everything John agreed. `/bonus` progress, `/reports` and the two forms, Settings → Bonuses, tech feedback on the home page (`app/MyFeedback.js`). John wants to review exactly what techs see before it goes live. No photos yet (no Supabase Storage set up); customers have no street address in the app (privacy), so follow-behinds show name + city.

## Next up (John's list)
1. Finish and launch manager bonuses (above): run change 47, test on the Vercel preview, review tech feedback with John, merge.
2. Inventory section (with manager bonuses), after the rest works.
3. Tech bonus payouts on the Technician Performance Card (waiting on bonus amounts and whether to use a driving-score gate; could share the Earnings box and Cash out).
4. Podium reviews credited to techs; sales pay through Everee (API enabled; token goes straight into Vercel/Supabase secrets, never into chat).

## Good to know
- FieldRoutes data syncs into Supabase through the Apps Script "Procare Sync" (`sync/ProcareSync.gs`). It saves the morning route snapshot and, since change 42, a daily copy of each office's numbers (`office_kpi_days`).
- appointment.employeeID is who BOOKED the job, never the tech. A person's FieldRoutes IDs come from `tech_fr_ids()`.
- To debug load problems, check Supabase logs (edge_logs 500s, postgres_logs "statement timeout").
