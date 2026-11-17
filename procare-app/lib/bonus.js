/**
 * Manager quarterly bonuses (change 47, BONUSES.md). A goal set is a quarter's goals for one person or several
 * (shared goals). Each goal is worth a share (weight %) of each member's quarter money (their yearly bonus ÷ 4).
 * Scoring:
 *   count    sales, reports, logged items: John's sliding scale on % of goal, paid along the line
 *            (default 100% → 100%, 90% → 80%, 80% → 60%, 70% → 40%, 60% → 20%, under 60% → nothing)
 *   cost     cost per new customer: lower is better, scored like a count on goal ÷ actual
 *   improve  auto-pay, AR, cancellations, job pool: share of the gap from the starting number that was closed;
 *            worse than the start pays nothing
 *   project  done (approved proof) by the due date pays 100%, otherwise nothing
 * Numbers come from bonus_numbers() (per office), report_tally() and approved bonus_entries.
 */
import { OFFICE_NAME } from './labels';

const pct = (n, d) => (d ? (100 * Number(n || 0)) / Number(d) : null);

export const KINDS = {
  tech_sales: { label: 'Technician sales', type: 'count', unit: 'sales', hint: 'Core sales sold by the office’s technicians this quarter. Sales reps’ and office sales don’t count.' },
  office_sales: { label: 'Office sales', type: 'count', unit: 'sales', hint: 'Every core sale in the office (or company) this quarter.' },
  marketing_sales: { label: 'Marketing sales', type: 'count', unit: 'sales', hint: 'Core sales to new customers, leaving out door-to-door, technician sales, office upsells and any source switched off in Settings.' },
  reports: { label: 'Ride-alongs and follow-behinds', type: 'count', unit: 'reports', hint: 'Reports filed by the people on this goal with “I told the tech” switched on. Usually techs × 4 (2 ride-alongs + 2 follow-behinds each).' },
  autopay: { label: 'Auto-pay', type: 'improve', unit: '%', better: 'high', hint: 'Recurring customers on valid auto-pay.' },
  ar_past: { label: 'AR 30+ days past due', type: 'improve', unit: '$', better: 'low', hint: 'Dollars 30 or more days past due.' },
  cancel: { label: 'Cancellation rate', type: 'improve', unit: '%', better: 'low', hint: 'Core cancels this quarter ÷ recurring customers at the start. Starts from last quarter’s rate.' },
  pool: { label: 'Job pool past due', type: 'improve', unit: '%', better: 'low', hint: 'Past-due jobs not on the schedule, as a share of recurring customers.' },
  cost_per_customer: { label: 'Cost per new customer', type: 'cost', unit: '$', better: 'low', hint: 'Ad spend logged with proof ÷ marketing sales. Lower is better.' },
  logged: { label: 'Logged with proof', type: 'count', unit: '', logged: true, hint: 'Social posts, Google reviews, website leads… The person logs each one with a link or screenshot; Ally approves.' },
  project: { label: 'Project', type: 'project', logged: true, hint: 'Done by the due date pays 100%. Logged with proof; Ally approves.' },
};
export const KIND_ORDER = ['tech_sales', 'autopay', 'ar_past', 'cancel', 'reports', 'pool', 'office_sales', 'marketing_sales', 'cost_per_customer', 'logged', 'project'];
/** Goals that take logged entries (what Mark logs): logged items, projects and ad spend. */
export const takesEntries = (kind) => kind === 'logged' || kind === 'project' || kind === 'cost_per_customer';

export const DEFAULT_SCALE = { floor: 60, floor_pay: 20, stretch: false, cap: 110 };

const plusDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const days = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5) + 1;

/** First and last day of a quarter. */
export function quarterRange(year, q) {
  const from = `${year}-${String(q * 3 - 2).padStart(2, '0')}-01`;
  const next = q === 4 ? `${year + 1}-01-01` : `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  return { from, to: plusDays(next, -1) };
}
export function quarterOf(ymd) {
  return { year: Number(ymd.slice(0, 4)), quarter: Math.floor((Number(ymd.slice(5, 7)) - 1) / 3) + 1 };
}
export function prevQuarter(year, q) {
  return q === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: q - 1 };
}
export const quarterName = (year, q) => `Q${q} ${year}`;

/** One office's numbers, or every office added up when office is null (company-wide). */
export function officeNumbers(nums, office) {
  const list = (nums?.offices || []).filter((o) => !office || o.office === office);
  const keys = ['sales', 'tech_sales', 'marketing', 'cancels', 'accounts_start', 'ap_start', 'ar_past_start', 'pool_start', 'accounts', 'ap_valid', 'ar_past', 'pool_past'];
  const out = {};
  keys.forEach((k) => {
    const vals = list.map((o) => o[k]).filter((v) => v !== null && v !== undefined);
    out[k] = vals.length ? vals.reduce((t, v) => t + Number(v), 0) : null;
  });
  return out;
}

/** The starting number recorded automatically (start of the quarter; cancellations: last quarter's rate). */
export function autoStart(kind, o, prev) {
  if (kind === 'autopay') return pct(o.ap_start, o.accounts_start);
  if (kind === 'ar_past') return o.ar_past_start;
  if (kind === 'pool') return pct(o.pool_start, o.accounts_start);
  if (kind === 'cancel') return prev ? pct(prev.cancels, prev.accounts_start) : null;
  return null;
}

/**
 * What a goal's number was over a past quarter (for setting goals: last quarter, and the same quarter last year).
 * null when the app doesn't have it: sales history comes from FieldRoutes, but auto-pay, AR and the job pool are only
 * known from the daily office copies, which started 2026-11-15. A cancellation rate before then is approximate
 * (today's customer count), flagged with approx.
 */
export function pastValue(kind, nums, office, range) {
  if (!nums || !range) return null;
  const o = officeNumbers(nums, office);
  const all = officeNumbers(nums, null);
  const hasSales = Number(all.sales || 0) > 0;
  const endOk = nums.end_day && nums.end_day > range.to && nums.end_day <= plusDays(range.to, 3);
  const startOk = nums.start_day && nums.start_day <= plusDays(range.from, 3);
  switch (kind) {
    case 'tech_sales': return hasSales ? { v: o.tech_sales } : null;
    case 'office_sales': return hasSales ? { v: o.sales } : null;
    case 'marketing_sales': return hasSales ? { v: o.marketing } : null;
    case 'cancel': return hasSales && (o.accounts_start || o.accounts) ? { v: pct(o.cancels, o.accounts_start || o.accounts), approx: !startOk } : null;
    case 'autopay': return endOk ? { v: pct(o.ap_valid, o.accounts) } : null;
    case 'ar_past': return endOk ? { v: o.ar_past } : null;
    case 'pool': return endOk ? { v: pct(o.pool_past, o.accounts) } : null;
    default: return null;
  }
}

/** Where a goal stands right now. ctx: { o, prev, entries (approved, this goal), reportCount }. */
export function actualOf(goal, ctx) {
  const { o } = ctx;
  switch (goal.kind) {
    case 'tech_sales': return o.tech_sales ?? 0;
    case 'office_sales': return o.sales ?? 0;
    case 'marketing_sales': return o.marketing ?? 0;
    case 'reports': return ctx.reportCount || 0;
    case 'autopay': return pct(o.ap_valid, o.accounts);
    case 'ar_past': return o.ar_past;
    case 'pool': return pct(o.pool_past, o.accounts);
    case 'cancel': return pct(o.cancels, o.accounts_start);
    case 'cost_per_customer': {
      const spend = ctx.entries.reduce((t, e) => t + Number(e.qty || 0), 0);
      return o.marketing ? spend / o.marketing : null;
    }
    case 'logged': return ctx.entries.reduce((t, e) => t + Number(e.qty || 0), 0);
    case 'project': return ctx.entries.some((e) => !goal.due_date || e.day <= goal.due_date) ? 1 : 0;
    default: return null;
  }
}

/** % of a goal's money earned for reaching `p`% of the goal, on the sliding scale. */
export function scalePay(p, scale = DEFAULT_SCALE) {
  if (p === null || Number.isNaN(p)) return 0;
  const floor = Number(scale.floor ?? 60);
  const floorPay = Number(scale.floor_pay ?? 20);
  const slope = (100 - floorPay) / (100 - floor);
  if (p >= 100) return scale.stretch ? Math.min(Number(scale.cap ?? 110), 100 + (p - 100) * slope) : 100;
  if (p < floor) return 0;
  return floorPay + (p - floor) * slope;
}

/** How far along a goal is, as % of the goal (counts and cost) or of the gap closed (improve). */
export function progressOf(goal, actual, start) {
  const k = KINDS[goal.kind];
  const target = Number(goal.target);
  if (actual === null || actual === undefined) return null;
  if (k.type === 'count') return target > 0 ? (100 * actual) / target : (actual > 0 ? 100 : null);
  if (k.type === 'cost') return actual > 0 ? (100 * target) / actual : null;
  if (k.type === 'project') return actual ? 100 : 0;
  if (start === null || start === undefined) return null;
  const gap = target - Number(start);
  if (gap === 0) return (k.better === 'low' ? actual <= target : actual >= target) ? 100 : 0;
  return Math.max(0, (100 * (actual - Number(start))) / gap);
}

export function payOf(goal, progress, scale) {
  const k = KINDS[goal.kind];
  if (progress === null) return 0;
  if (k.type === 'count' || k.type === 'cost') return scalePay(progress, scale);
  return Math.min(100, progress);   // improve and projects: straight line, never over 100%
}

/** Where a goal would land at the current pace. Counts and the cancellation rate grow over the quarter. */
function projectedOf(goal, actual, share) {
  if (actual === null || share <= 0) return actual;
  if (KINDS[goal.kind].type === 'count' || goal.kind === 'cancel') return actual / share;
  return actual;
}

/** "6 more sales to reach 80%", for counts that haven't reached the goal. */
function nextStep(goal, actual, scale) {
  const k = KINDS[goal.kind];
  const target = Number(goal.target);
  if (k.type !== 'count' || !(target > 0) || actual >= target) return null;
  const floor = Number(scale.floor ?? 60);
  const steps = [];
  for (let s = floor; s < 100; s += 10) steps.push(s);
  steps.push(100);
  const p = (100 * actual) / target;
  const s = steps.find((x) => x > p + 1e-9);
  const need = Math.ceil((target * s) / 100 - actual - 1e-9);
  const unit = goal.kind === 'logged' ? '' : ` ${k.unit}`;
  return need > 0 ? `${need} more${unit} to reach ${Math.round(scalePay(s, scale))}%` : null;
}

/**
 * Score one goal set. Returns { goals: [...], people: [{ id, quarter, earned, projected }], share }.
 * input: { set, goals, members, plans: {employee_id: yearly amount}, nums, prevNums, entries (approved), tally, today, scale }
 */
export function scoreSet({ set, goals, members, plans, nums, prevNums, entries, tally, today, scale = DEFAULT_SCALE }) {
  const { from, to } = quarterRange(set.year, set.quarter);
  const through = nums?.through || (today < from ? null : (today > to ? to : today));
  const share = through ? Math.min(1, days(from, through) / days(from, to)) : 0;
  const o = officeNumbers(nums, set.office);
  const prev = prevNums ? officeNumbers(prevNums, set.office) : null;
  const memberIds = new Set(members.map((m) => m.employee_id || m.id));
  const reportCount = (tally || []).filter((r) => r.told_tech && memberIds.has(r.author_id) && (!set.office || r.office === set.office)
    && r.day >= from && r.day <= to).length;

  const rows = goals.map((g) => {
    const k = KINDS[g.kind] || {};
    const ent = (entries || []).filter((e) => e.goal_id === g.id && e.status === 'approved');
    const actual = actualOf(g, { o, prev, entries: ent, reportCount });
    const start = g.start_value !== null && g.start_value !== undefined && g.start_value !== '' ? Number(g.start_value) : autoStart(g.kind, o, prev);
    const progress = progressOf(g, actual, start);
    const pay = payOf(g, progress, scale);
    const projected = projectedOf(g, actual, share);
    const projectedPay = payOf(g, progressOf(g, projected, start), scale);
    return { ...g, type: k.type, unit: k.unit, actual, start, startAuto: g.start_value === null || g.start_value === undefined || g.start_value === '',
      progress, pay, projected, projectedPay, next: nextStep(g, actual, scale) };
  });

  const people = [...memberIds].map((id) => {
    const quarter = Number(plans?.[id] || 0) / 4;
    const earned = rows.reduce((t, g) => t + (quarter * Number(g.weight || 0) * g.pay) / 10000, 0);
    const projected = rows.reduce((t, g) => t + (quarter * Number(g.weight || 0) * g.projectedPay) / 10000, 0);
    return { id, quarter, earned: Math.round(earned * 100) / 100, projected: Math.round(projected * 100) / 100 };
  });
  return { goals: rows, people, share, through, from, to };
}

/** A number the way its goal shows it. */
export function fmt(kind, v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '–';
  const unit = KINDS[kind]?.unit;
  if (unit === '%') return `${Number(v).toFixed(1)}%`;
  if (unit === '$') return `$${Math.round(Number(v)).toLocaleString('en-US')}`;
  if (kind === 'project') return Number(v) ? 'Done' : 'Not done';
  return Math.round(Number(v) * 10) / 10 === Math.round(Number(v)) ? Math.round(Number(v)).toLocaleString('en-US') : Number(v).toFixed(1);
}

export const money0 = (n) => `$${Math.round(Number(n || 0)).toLocaleString('en-US')}`;
export const money2 = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const whereName = (office) => (office ? OFFICE_NAME[office] || office : 'Company-wide');

/** Equal weights that add up to exactly 100 (20 each for 5). */
export function equalWeights(n) {
  if (!n) return [];
  const base = Math.floor(10000 / n) / 100;
  const out = Array(n).fill(base);
  out[n - 1] = Math.round((100 - base * (n - 1)) * 100) / 100;
  return out;
}
