# Manager bonuses, ride-alongs and follow-behinds (designed with John, 2026-11-16)

Branch `manager-bonuses`. Database change 47. Everything below was agreed with John in chat.

## Quarterly bonuses
- **Settings → Bonuses** (Ally = HR approver, C-Suite, the President): each manager's **yearly bonus**, paid as
  1/4 per quarter ($4,000 a year = $1,000 a quarter).
- Each quarter Ally sets **goal sets**: usually 5 goals, the quarter's money split evenly (20% each), weights editable.
- **Shared by default.** One goal set can have several people (West: Brandon Logan, KC Todd and Miles). A toggle
  splits it into separate sets when Ally wants different goals per person. Each person is paid on their own bonus amount.
- Goals are only on what a manager controls:
  - Service: technician sales (not reps' or office sales), auto-pay %, AR 30+ dollars, cancellation %, reports.
  - Administrative: office KPIs, including the job pool.
  - Marketing (Mark Daniel): marketing-source sales, cost per new customer, Google reviews, social posts, website leads,
    projects. Sales exclude door-to-door (sales reps), technician sales and office upsells; community events count.
    Ally switches individual FieldRoutes sources on or off.
- **Scoring**
  - Counts (sales, reports, logged items): John's scale, paid along the line: 100% of goal pays 100%, 90% → 80%,
    80% → 60%, 70% → 40%, 60% → 20%, under 60% → nothing (2% of pay per 1% short).
  - "Improve this number" (auto-pay, AR, cancellations, job pool): paid by how much of the gap from the starting number
    was closed. Starting number is recorded automatically on day 1 (cancellations: last quarter's rate); Ally can change it.
    Worse than the start pays nothing.
  - Cost per new customer: lower is better, scored like a count (goal ÷ actual).
  - Projects: done by the due date pays 100%, otherwise nothing.
  - Optional stretch (off by default): beating a count goal keeps paying up to a cap, e.g. 110%.
- **Progress page** `/bonus`: each goal, where they'd land at the current pace, the next step ("6 more sales to reach 80%"),
  and dollars so far. Report pacing across the quarter.
- **Logged with proof**: Mark logs posts, campaigns, ad spend, projects (date, amount, link, note). **Ally approves**; only
  approved entries count.
- **Quarter end**: Ally approves the final numbers, they lock, and each person's bonus lands in their Earnings to cash
  out (same flow as competition prizes: Ally enters it in ADP and marks it paid).

## Reports (count toward the reports goal)
- Each tech, each quarter: **2 ride-alongs + 2 follow-behinds** (follow-behind = quality check). Target = techs at the
  start of the quarter × 4.
- A report only counts when the manager's **"I told the tech" switch** is on.
- Each report emails the report recipients (Ryan Boyd, Operations Manager; set in Settings → Bonuses).
- Offline: forms save on the phone as they're typed and send when the signal comes back.

### Ride-along (one per day)
Service yes/no: knocked or tried to contact · door hanger or contact at the end · GPS treated properly · TBS serviced
properly · service slip filled out properly · upsell (Yes / No / Didn't get the chance, nobody home).
Truck: interior Good / Needs attention · cleanliness (5) · dash warning lights (None, Oil change, Tire pressure,
Check engine, Other) · summary · Where to improve switches (pest knowledge, product knowledge, upsell ability,
retention ability, time management, customer interaction, body language, organized and professional) + comment
("What should this tech focus on next? …") · switch: "I clearly explained to the tech what they can improve on."

Truck cleanliness: 🗑️ Messy "Something may be living in here." · 🍟 Lived-in "A few fries from last Tuesday." ·
🧹 Fairly clean "A quick vacuum away." · ✨ Clean "Ready for a customer to look inside." ·
🏆 Your mother would be proud "Spotless. Frame-worthy."

### Follow-behind (one per visit)
Customer picked from the tech's stops in the last 7 days; the app suggests random ones so nobody cherry-picks.
Talking to the account holder? · communicated Just before / Just after / Both / Neither · ratings (1-5, below) ·
upsell Taken / Missed / None + notes · auto-pay Yes / No / Already on · positive / negative feedback · what they'd
like improved · switch: "I reached out to the tech to let them know their work was checked and shared feedback."

- Overall experience: 😠 Upset "Talking about canceling." · 😕 Let down "Expected a superhero, got a sidekick." ·
  😐 Fine "No complaints, no compliments." · 🙂 Happy "Pleased and would recommend us." ·
  🤩 Raving fan "Might invite the tech to Thanksgiving."
- Impression of the tech: Not a fan "Would rather see a different tech next time." · Something was off "Seemed rushed,
  quiet or late." · Polite "Friendly enough and got the job done." · Impressed "Explained what they did and answered
  questions." · Their favorite "Knows the tech by name and asks for them."
- Webs: 🕸️ Haunted house "No Halloween decorations needed." · Missed spots "Webs left at several eaves, windows or
  doors." · Mostly clear "A few stragglers." · Clean "Swept everywhere that matters." · Charlotte moved out "Not a web
  in sight." (A nod to Charlotte's Web)
- Termite stations (termite customers only): Poor job "Missing, damaged or clearly not checked." · Neglected
  "Overgrown, hard to find or lids loose." · Okay "Checked, but could be tidier." · Good "Clean, easy to find, lids
  secure." · Textbook "Belongs in the training manual." + "Why this rating?"

### Alerts and what the tech sees
- Warning light or interior "Needs attention" → email the tech's office branch managers (technician managers in that
  office: West Brandon Logan and KC Todd, East Lisa Shaw, South Oscar). Each truck item stays open until switched to Fixed.
- Follow-behind marked Upset or Let down → branch managers get an alert right away.
- Tech landing page: "Your work was checked" notes, Where to improve + the manager's comment, open truck items,
  shout-out when a customer rates them "Their favorite", and a **Got it** button. Everything else is manager-only.
  **John wants to review exactly what techs see before it goes live.**
- Training patterns: the Where to improve switches added up per office per quarter.
