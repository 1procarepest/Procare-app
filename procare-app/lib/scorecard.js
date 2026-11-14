/** Tech Scorecard periods and incentive math. The numbers come from tech_scorecard() in Supabase. */

export const PERIODS = [
  { key: 'today', label: 'Today', prior: 'the same day last week' },
  { key: 'thisWeek', label: 'This week', prior: 'same point last week' },
  { key: 'lastWeek', label: 'Last week', prior: 'the week before' },
  { key: 'thisMonth', label: 'This month', prior: 'same point last month' },
  { key: 'lastMonth', label: 'Last month', prior: 'the month before' },
  { key: 'thisYear', label: 'This year', prior: 'same point last year' },
];

export const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
export const pct = (a, b) => (num(b) ? (num(a) / num(b)) * 100 : null);
const r2 = (n) => Math.round(n * 100) / 100;

/** Completion % and reservice rate for one row (cur or prior). */
export function rates(m) {
  return {
    comp: pct(m.serv, m.sched),
    // Reservices that count against the tech: regular reservices and incompletes (partials never do).
    resv: m.reservices === null || m.reservices === undefined ? null : pct(num(m.reservices) + num(m.incompletes), m.serv),
  };
}

/**
 * Bonus estimate for one period. Monthly amounts are prorated by `scale` (the period's length in
 * months), except the per-review and per-sale amounts. drive_gate > 0: a driving score below it
 * holds every bonus for that period.
 */
export function calcPay(m, R, scale) {
  const p = { completion: 0, stars: 0, driving: 0, sales: 0, cancelPenalty: 0, gated: false, distractedCap: false };
  const comp = pct(m.serv, m.sched) || 0;
  p.minServed = Math.ceil(num(R.min_served) * scale);
  p.qualified = num(m.serv) >= p.minServed;
  p.distractedMax = Math.ceil(num(R.distracted_max) * scale);
  const drove = m.drive_score !== null && m.drive_score !== undefined && num(m.drive_miles) > 0;
  if (p.qualified) {
    if (comp >= num(R.comp_hi)) p.completion = num(R.comp_hi_amt) * scale;
    else if (comp >= num(R.comp_lo)) p.completion = num(R.comp_lo_amt) * scale;
    p.stars = num(m.stars) * num(R.star_amt);
    if (drove) {
      if (m.drive_score >= num(R.drive_hi)) p.driving = num(R.drive_hi_amt) * scale;
      else if (m.drive_score >= num(R.drive_lo)) p.driving = num(R.drive_lo_amt) * scale;
      if (num(m.distracted) > p.distractedMax && p.driving) { p.distractedCap = true; p.drivingLost = r2(p.driving); p.driving = 0; }
    }
  }
  p.sales = num(m.sales_done) * num(R.sale_amt);
  // No production bonus: FieldRoutes sends −1.00 as the production value of every job (checked 2026-11-14).
  for (const k of ['completion', 'stars', 'driving', 'sales']) p[k] = r2(p[k]);
  p.service = r2(p.completion + p.stars + p.driving);
  p.cancelPenalty = Math.min(r2(num(m.cx_tech) * num(R.cancel_tech_penalty)), p.service);
  p.gross = r2(p.service - p.cancelPenalty + p.sales);
  p.gated = num(R.drive_gate) > 0 && drove && m.drive_score < num(R.drive_gate);
  p.held = p.gated ? p.gross : 0;
  p.total = p.gated ? 0 : p.gross;
  return p;
}

export const money = (n) => '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n) => '$' + Math.round(num(n)).toLocaleString('en-US');
