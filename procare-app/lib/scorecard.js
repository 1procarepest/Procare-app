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
 * Which incentives are switched on (Rules page). Sales is on unless switched off; every other incentive is off
 * until switched on (2026-11-18: John starts with sales only).
 */
export const INCENTIVES = ['sales', 'autopay', 'completed', 'completion', 'reservice', 'reviews', 'safety', 'cancels'];
export const incentiveOn = (R, k) => (k === 'sales' ? R?.on_sales !== false : R?.[`on_${k}`] === true);

/**
 * Bonus estimate for one period. Monthly amounts are prorated by `scale` (the period's length in months), except
 * the per-item amounts (each sale, auto-pay and top review). Service incentives (everything but sales and auto-pay)
 * need the minimum completed jobs. drive_gate > 0: a driving score below it holds the bonuses for that period;
 * with drive_gate_keep_sales (the default) sales bonuses still pay.
 */
export function calcPay(m, R, scale) {
  const on = (k) => incentiveOn(R, k);
  const p = { completion: 0, stars: 0, driving: 0, sales: 0, autopay: 0, completed: 0, reservice: 0, cancelPenalty: 0, gated: false, distractedCap: false };
  const comp = pct(m.serv, m.sched) || 0;
  const resv = num(m.serv) ? pct(num(m.reservices) + num(m.incompletes), m.serv) : null;
  p.minServed = Math.ceil(num(R.min_served) * scale);
  // The minimum only matters while a service incentive is on; with sales / auto-pay only, nobody is "under".
  p.minMatters = ['completed', 'completion', 'reservice', 'reviews', 'safety'].some(on);
  p.qualified = !p.minMatters || num(m.serv) >= p.minServed;
  p.distractedMax = Math.ceil(num(R.distracted_max) * scale);
  const drove = m.drive_score !== null && m.drive_score !== undefined && num(m.drive_miles) > 0;
  if (p.qualified) {
    if (on('completion')) {
      if (comp >= num(R.comp_hi)) p.completion = num(R.comp_hi_amt) * scale;
      else if (comp >= num(R.comp_lo)) p.completion = num(R.comp_lo_amt) * scale;
    }
    if (on('completed') && num(m.serv) >= Math.ceil(num(R.completed_min) * scale)) p.completed = num(R.completed_amt) * scale;
    if (on('reservice') && resv !== null && resv <= num(R.resv_max)) p.reservice = num(R.resv_amt) * scale;
    if (on('reviews')) p.stars = num(m.stars) * num(R.star_amt);
    if (on('safety') && drove) {
      if (m.drive_score >= num(R.drive_hi)) p.driving = num(R.drive_hi_amt) * scale;
      else if (m.drive_score >= num(R.drive_lo)) p.driving = num(R.drive_lo_amt) * scale;
      if (num(m.distracted) > p.distractedMax && p.driving) { p.distractedCap = true; p.drivingLost = r2(p.driving); p.driving = 0; }
    }
  }
  if (on('autopay')) p.autopay = num(m.autopay_added) * num(R.autopay_amt);
  if (on('sales')) p.sales = num(m.sales_done) * num(R.sale_amt);
  // No production bonus: FieldRoutes sends −1.00 as the production value of every job (checked 2026-11-14).
  for (const k of ['completion', 'stars', 'driving', 'sales', 'autopay', 'completed', 'reservice']) p[k] = r2(p[k]);
  p.service = r2(p.completion + p.stars + p.driving + p.completed + p.reservice + p.autopay);
  p.cancelPenalty = on('cancels') ? Math.min(r2(num(m.cx_tech) * num(R.cancel_tech_penalty)), p.service) : 0;
  p.gross = r2(p.service - p.cancelPenalty + p.sales);
  p.gated = num(R.drive_gate) > 0 && drove && m.drive_score < num(R.drive_gate);
  p.keepsSales = R.drive_gate_keep_sales !== false;
  p.held = p.gated ? (p.keepsSales ? r2(p.service - p.cancelPenalty) : p.gross) : 0;
  p.total = r2(p.gross - p.held);
  return p;
}

export const money = (n) => '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n) => '$' + Math.round(num(n)).toLocaleString('en-US');
