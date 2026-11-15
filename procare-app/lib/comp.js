/**
 * Sales pay plans (shadow mode). Every amount comes from comp_settings and comp_assignments;
 * nothing here is a dollar figure. Rules (from the President, 2026-11-15):
 *  - Commission plan: an up-front amount (default $100) per serviced sale, paid the Monday after the
 *    week it was serviced. Termite and mosquito: the up-front amount is the whole commission.
 *    Pest: rate × contract value, where contract value = yearly billing + initial price.
 *  - Rate: scale start + step for every `every` serviced sales this year (all services count), up to max.
 *    It resets every January and is retroactive to every pest sale that year.
 *  - Bonus rate for one sale whose contract value reaches a bonus level (60/65/70%).
 *  - Quarter checks on the 20th of the next month = what the year's good sales earned − everything
 *    already paid. Q1–Q3 hold back hold_pct of the part above the up-fronts; Q4 (Jan 20) releases it.
 *    A rep who has left loses the hold.
 *  - Clawbacks: a cancel within clawback_days of the first service takes back everything paid on the
 *    sale, even across years. Customers more than past_due_days past due don't count until they pay.
 *  - Termite on the commission plan also pays termite_initial_pct (0/50/100%) of the initial price, up front.
 *  - Flat plan: a set amount per service type, paid in full up front; no bonus, holds or clawbacks.
 */

export const GROUPS = ['pest', 'termite', 'mosquito'];
export const GROUP_LABEL = { pest: 'Pest', termite: 'Termite bait', mosquito: 'Mosquito' };
export const PLAN_LABEL = { commission: 'Commission plan', flat: 'Flat rate plan' };

export const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));
export const cents = (v) => Math.round(n(v) * 100) / 100;
export const money = (v) => (n(v) < 0 ? '−' : '') + '$' + Math.abs(cents(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (v) => (n(v) < 0 ? '−' : '') + '$' + Math.round(Math.abs(n(v))).toLocaleString('en-US');
export const pct = (v) => `${Math.round(n(v) * 10) / 10}%`;

// ---------- dates (plain YYYY-MM-DD strings, no time zones) ----------
const D = (ymd) => new Date(`${ymd}T12:00:00Z`);
const ymd = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, k) => { const d = D(s); d.setUTCDate(d.getUTCDate() + k); return ymd(d); };
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);
/** Up-front payday: the Monday after the Monday–Sunday week the sale was serviced. */
export const payMonday = (s) => addDays(s, 7 - ((D(s).getUTCDay() + 6) % 7));
export const quarterOf = (s) => Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1;
export const quarterEnd = (year, q) => ymd(new Date(Date.UTC(year, q * 3, 0, 12)));
export const quarterStart = (year, q) => `${year}-${String(q * 3 - 2).padStart(2, '0')}-01`;
export const quarterPayDate = (year, q) => (q < 4 ? `${year}-${String(q * 3 + 1).padStart(2, '0')}-20` : `${year + 1}-01-20`);
export const nice = (s) => (s ? D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
export const niceY = (s) => (s ? D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');

// ---------- plan pieces ----------
export function scaleFor(settings, a) {
  const base = settings?.scales?.[a?.scale] || settings?.scales?.first_year || { start: 0, step: 0, every: 50, max: 0 };
  return {
    name: base.name || a?.scale,
    start: a?.start_rate ?? n(base.start),
    step: a?.step_rate ?? n(base.step),
    every: Math.max(1, n(base.every) || 50),
    max: n(base.max),
  };
}
/** The rate after `count` serviced sales this year. */
export const rateAt = (scale, count) => Math.min(scale.max, scale.start + Math.floor(count / scale.every) * scale.step);
/** Bonus rate a single pest sale earns from its contract value (0 if none). */
export function bonusRate(settings, cv) {
  return (settings?.bonus || []).filter((b) => n(cv) >= n(b.min)).reduce((m, b) => Math.max(m, n(b.rate)), 0);
}
export function upfrontFor(settings, a, grp) {
  if (a?.plan === 'flat') return n(settings?.[`flat_${grp}`]);
  return a?.upfront ?? n(settings?.upfront);
}
/** Commission plan: a termite sale also pays termite_initial_pct of the initial price the rep charged. */
export function termiteInitial(settings, a, init) {
  return a?.plan === 'commission' ? (n(init) * n(settings?.termite_initial_pct ?? 100)) / 100 : 0;
}
/** Everything paid up front on one sale. */
export const saleUpfront = (settings, a, x) => upfrontFor(settings, a, x.g) + (x.g === 'termite' ? termiteInitial(settings, a, x.init) : 0);
export const planOf = (data, emp, year) => (data?.plans || []).find((p) => p.employee_id === emp && p.year === year) || null;

// ---------- statement ----------
/**
 * One rep's pay for a year, as of `today`.
 * Returns { plan, scale, weeks[], quarters[], sales[], totals, carryIn, priorClawbacks[] }.
 */
export function statement(data, emp, year, today, { prior = true } = {}) {
  const s = data.settings || {};
  const a = planOf(data, emp, year);
  const rep = (data.reps || []).find((r) => r.id === emp);
  const all = (data.sales || []).filter((x) => x.e === emp);
  const mine = all.filter((x) => x.served.slice(0, 4) === String(year));
  const out = { year, plan: a, rep, sales: mine, weeks: [], quarters: [], carryIn: 0, priorClawbacks: [], settings: s, upfrontYtd: 0 };
  if (!a) return out;
  const scale = scaleFor(s, a);
  out.scale = scale;

  const up = (x) => cents(saleUpfront(s, a, x));
  const cancelledBy = (x, asOf) => x.can && x.can <= asOf && daysBetween(x.served, x.can) <= n(s.clawback_days);
  const pastDue = (x) => n(x.bal) > 0 && n(x.age) > n(s.past_due_days);

  // Weekly up-fronts
  const byMonday = new Map();
  mine.forEach((x) => {
    const m = payMonday(x.served);
    if (!byMonday.has(m)) byMonday.set(m, []);
    byMonday.get(m).push(x);
  });
  out.weeks = [...byMonday.entries()].sort(([p], [q]) => (p < q ? 1 : -1)).map(([payday, list]) => ({
    payday, from: addDays(payday, -7), to: addDays(payday, -1), sales: list.map((x) => ({ ...x, upfront: up(x) })),
    total: cents(list.reduce((t, x) => t + up(x), 0)), paid: payday <= today,
  }));
  const upfrontsThrough = (d) => cents(mine.filter((x) => payMonday(x.served) <= d).reduce((t, x) => t + up(x), 0));
  out.upfrontYtd = upfrontsThrough(today);

  if (a.plan === 'flat') return out;

  // Last year: clawbacks for its sales cancelled this year, and anything it left owing
  if (prior) {
    const last = statement(data, emp, year - 1, today, { prior: false });
    if (last.plan?.plan === 'commission' && last.quarters.length === 4) {
      const q4 = last.quarters[3];
      out.carryIn = Math.min(0, q4.check);
      const ends = `${year - 1}-12-31`;
      const rateOf = Object.fromEntries(q4.lines.map((l) => [l.id, l]));
      last.sales.forEach((x) => {
        const l = rateOf[x.id];
        if (l && l.good && x.can && x.can > ends && daysBetween(x.served, x.can) <= n(s.clawback_days)) {
          out.priorClawbacks.push({ ...x, amount: l.earned });
        }
      });
    }
  }

  let checksPaid = 0;
  for (let q = 1; q <= 4; q += 1) {
    const start = quarterStart(year, q);
    if (start > today) break;
    const end = quarterEnd(year, q);
    const asOf = end < today ? end : today;
    const payDate = quarterPayDate(year, q);
    const ytd = mine.filter((x) => x.served <= asOf);
    const lines = ytd.map((x) => {
      const cancelled = cancelledBy(x, asOf);
      const held = !cancelled && pastDue(x);
      return { ...x, cancelled, held, good: !cancelled && !held };
    });
    const count = lines.filter((l) => l.good).length;
    const rate = rateAt(scale, count);
    lines.forEach((l) => {
      l.bonus = l.g === 'pest' ? bonusRate(s, l.cv) : 0;
      l.rate = l.g === 'pest' ? Math.max(rate, l.bonus) : null;
      l.earned = cents(l.g === 'pest' ? (n(l.cv) * l.rate) / 100 : up(l));
      l.upfront = up(l);
    });
    const owed = cents(lines.filter((l) => l.good).reduce((t, l) => t + l.earned, 0));
    const upfronts = cents(lines.reduce((t, l) => t + l.upfront, 0));
    const priorBack = cents(out.priorClawbacks.filter((x) => x.can <= asOf).reduce((t, x) => t + x.amount, 0));
    const net = owed - priorBack + out.carryIn;                 // what the year has earned, all told
    const keepHold = q < 4 || (rep && rep.active === false);
    const above = Math.max(0, net - upfronts);
    const target = upfronts + (keepHold ? above * (1 - n(s.hold_pct) / 100) : net - upfronts);
    const raw = cents(target - upfronts - checksPaid);
    const check = raw;
    const paidOut = Math.max(0, raw);
    out.quarters.push({
      q, start, end, asOf, payDate, done: end < today, count, rate, lines, owed, upfronts, priorBack,
      held: keepHold ? cents(above * n(s.hold_pct) / 100) : 0,
      forfeited: q === 4 && rep && rep.active === false,
      check, paidOut, checksBefore: cents(checksPaid),
      cancels: lines.filter((l) => l.cancelled), pending: lines.filter((l) => l.held),
      pest: lines.filter((l) => l.good && l.g === 'pest'),
    });
    checksPaid += paidOut;
  }
  out.checksYtd = cents(out.quarters.filter((q) => q.payDate <= today).reduce((t, q) => t + q.paidOut, 0));
  return out;
}

/** Monday on or after today (the next up-front payday). */
export const nextMonday = (today) => { const k = (8 - D(today).getUTCDay()) % 7; return addDays(today, k); };

// ---------- calculator ----------
/**
 * A year's pay from a plan and a pace. mix = { pest, termite, mosquito } in %.
 * cancelPct of sales are assumed to cancel or go past due (no pay on them).
 */
export function project(settings, a, { days, perDay, mix, pestCv, cancelPct, termiteInit = 0 }) {
  const total = Math.max(0, Math.round(n(days) * n(perDay)));
  const share = (g) => n(mix[g]) / Math.max(1, GROUPS.reduce((t, k) => t + n(mix[k]), 0));
  const count = { pest: Math.round(total * share('pest')), termite: Math.round(total * share('termite')) };
  count.mosquito = Math.max(0, total - count.pest - count.termite);
  const keep = 1 - Math.min(100, Math.max(0, n(cancelPct))) / 100;
  const good = Math.round(total * keep);
  if (a.plan === 'flat') {
    const by = Object.fromEntries(GROUPS.map((g) => [g, count[g] * keep * n(settings[`flat_${g}`])]));
    const year = GROUPS.reduce((t, g) => t + by[g], 0);
    return { total, count, good, by, year, upfront: year, backend: 0, rate: null, ladder: [], perSale: total ? year / total : 0 };
  }
  const scale = scaleFor(settings, a);
  const rate = rateAt(scale, good);
  const bonus = bonusRate(settings, pestCv);
  const pestRate = Math.max(rate, bonus);
  const upAmt = upfrontFor(settings, a, 'pest');
  const by = {
    pest: count.pest * keep * n(pestCv) * pestRate / 100,
    termite: count.termite * keep * (upFor(settings, a, 'termite') + termiteInitial(settings, a, termiteInit)),
    mosquito: count.mosquito * keep * upFor(settings, a, 'mosquito'),
  };
  const year = GROUPS.reduce((t, g) => t + by[g], 0);
  const upfront = total * upAmt + count.termite * termiteInitial(settings, a, termiteInit);   // up fronts go out on every serviced sale
  const ladder = [];
  for (let k = 0; ; k += 1) {
    const at = k * scale.every;
    const r = rateAt(scale, at);
    if (k > 0 && r === ladder[ladder.length - 1].rate) break;
    ladder.push({ at, rate: r, reached: good >= at });
    if (r >= scale.max || k > 60) break;
  }
  return { total, count, good, by, year, upfront, backend: year - upfront, rate, bonus, pestRate, ladder, scale, perSale: total ? year / total : 0 };
}
const upFor = (settings, a, g) => upfrontFor(settings, a, g);

/** Sales per day needed to reach `goal` dollars a year (binary search over the projection). */
export function perDayFor(settings, a, inputs, goal) {
  if (!(n(goal) > 0) || !(n(inputs.days) > 0)) return null;
  let lo = 0; let hi = 20;
  if (project(settings, a, { ...inputs, perDay: hi }).year < goal) return null;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (project(settings, a, { ...inputs, perDay: mid }).year >= goal) hi = mid; else lo = mid;
  }
  return hi;
}
