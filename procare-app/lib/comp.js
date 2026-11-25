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
 *  - Termite (both plans, since 2026-11-24) also pays a share of the initial price, up front: the rep's own
 *    comp_assignments.termite_initial_pct (change 90), else the company's termite_initial_pct.
 *  - Flat plan: a set amount per service type, paid in full up front; no bonus, holds or clawbacks.
 *  - Salary plan (change 93): a set weekly salary (comp_assignments.salary, from salary_from or January 1) instead
 *    of up fronts. Commission is figured exactly as on the commission plan (termite and mosquito earn their up-front
 *    amount), and each quarter check = earned so far this year − salary paid − earlier checks, with the same hold and
 *    clawbacks. A quarter that doesn't beat the salary pays nothing; the shortfall carries through the year only.
 *  - All pay is processed on Mondays and paid on Wednesdays (John, 2026-11-25); "payday" here is the Monday.
 */

export const GROUPS = ['pest', 'termite', 'mosquito'];
export const GROUP_LABEL = { pest: 'Pest', termite: 'Termite bait', mosquito: 'Mosquito' };
export const PLAN_LABEL = { commission: 'Commission plan', flat: 'Flat rate plan', salary: 'Salary plan' };

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
  if (a?.plan === 'salary') return 0;          // salary replaces up fronts
  return a?.upfront ?? n(settings?.upfront);
}
/** What a sale earns at the up-front amount on the commission math (salary plan: termite and mosquito commission). */
export const commissionUpfront = (settings, a) => (a?.upfront ?? n(settings?.upfront));
/** The share (%) of a termite sale's initial price this rep is paid up front: their own, else the company's (change 90). */
export const termitePct = (settings, a) => {
  if (!a?.plan) return 0;
  const own = a.termite_initial_pct;
  return own === null || own === undefined || own === '' ? n(settings?.termite_initial_pct ?? 100) : n(own);
};
/** Both plans (John, 2026-11-24): a termite sale also pays the rep's termitePct of the initial price they charged. */
export function termiteInitial(settings, a, init) {
  return (n(init) * termitePct(settings, a)) / 100;
}
/** Everything paid up front on one sale (nothing on the salary plan). */
export const saleUpfront = (settings, a, x) => (a?.plan === 'salary' ? 0 : upfrontFor(settings, a, x.g) + (x.g === 'termite' ? termiteInitial(settings, a, x.init) : 0));
/** What a termite or mosquito sale earns in the quarter math: its up front, or on salary what the commission plan would pay up front. */
const flatEarned = (settings, a, x) => (a?.plan === 'salary' ? commissionUpfront(settings, a) + (x.g === 'termite' ? termiteInitial(settings, a, x.init) : 0) : saleUpfront(settings, a, x));
/** Salary paydays (Mondays) in a year: each Monday whose Monday–Sunday week before it falls in the year, from salary_from on. */
export function salaryWeeks(a, year, through) {
  if (a?.plan !== 'salary' || !(n(a.salary) > 0)) return [];
  const from = a.salary_from && String(a.salary_from).slice(0, 4) === String(year) ? String(a.salary_from).slice(0, 10) : `${year}-01-01`;
  const out = [];
  for (let p = payMonday(from); addDays(p, -1) <= `${year}-12-31` && p <= through; p = addDays(p, 7)) out.push(p);
  return out;
}
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

  // Weekly up-fronts (and the weekly salary on the salary plan, through next Monday)
  const salary = a.plan === 'salary' ? cents(a.salary) : 0;
  const salaryDays = salaryWeeks(a, year, nextMonday(today));
  const byMonday = new Map(salaryDays.map((m) => [m, []]));
  mine.forEach((x) => {
    const m = payMonday(x.served);
    if (!byMonday.has(m)) byMonday.set(m, []);
    byMonday.get(m).push(x);
  });
  const paysSalary = new Set(salaryDays);
  out.weeks = [...byMonday.entries()].sort(([p], [q]) => (p < q ? 1 : -1)).map(([payday, list]) => {
    const sal = paysSalary.has(payday) ? salary : 0;
    return {
      payday, from: addDays(payday, -7), to: addDays(payday, -1), sales: list.map((x) => ({ ...x, upfront: up(x) })),
      salary: sal, total: cents(sal + list.reduce((t, x) => t + up(x), 0)), paid: payday <= today,
    };
  });
  const salaryThrough = (d) => cents(salaryDays.filter((m) => m <= d).length * salary);
  out.salaryYtd = salaryThrough(today);
  out.upfrontYtd = cents(mine.filter((x) => payMonday(x.served) <= today).reduce((t, x) => t + up(x), 0) + out.salaryYtd);

  if (a.plan === 'flat') return out;

  // Last year: clawbacks for its sales cancelled this year, and anything it left owing
  if (prior) {
    const last = statement(data, emp, year - 1, today, { prior: false });
    if (['commission', 'salary'].includes(last.plan?.plan) && last.quarters.length === 4) {
      const q4 = last.quarters[3];
      // A salary year that didn't beat its salary isn't owed back; clawbacks still are
      out.carryIn = last.plan.plan === 'salary' ? 0 : Math.min(0, q4.check);
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
      l.earned = cents(l.g === 'pest' ? (n(l.cv) * l.rate) / 100 : flatEarned(s, a, l));
      l.upfront = up(l);
    });
    const owed = cents(lines.filter((l) => l.good).reduce((t, l) => t + l.earned, 0));
    // Up fronts on this year's sales; on the salary plan, the salary paid for weeks through this quarter
    const salaryPaid = salary ? cents(salaryDays.filter((m) => addDays(m, -1) <= asOf).length * salary) : 0;
    const upfronts = cents(lines.reduce((t, l) => t + l.upfront, 0) + salaryPaid);
    const priorBack = cents(out.priorClawbacks.filter((x) => x.can <= asOf).reduce((t, x) => t + x.amount, 0));
    const net = owed - priorBack + out.carryIn;                 // what the year has earned, all told
    const keepHold = q < 4 || (rep && rep.active === false);
    const above = Math.max(0, net - upfronts);
    const target = upfronts + (keepHold ? above * (1 - n(s.hold_pct) / 100) : net - upfronts);
    const raw = cents(target - upfronts - checksPaid);
    // Salary plan: a quarter that doesn't beat the salary just pays nothing (the year-to-date math carries it)
    const check = a.plan === 'salary' ? Math.max(0, raw) : raw;
    const paidOut = Math.max(0, raw);
    out.quarters.push({
      q, start, end, asOf, payDate, done: end < today, count, rate, lines, owed, upfronts, salaryPaid, priorBack,
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
  const upAmt = a.plan === 'salary' ? commissionUpfront(settings, a) : upfrontFor(settings, a, 'pest');
  const by = {
    pest: count.pest * keep * n(pestCv) * pestRate / 100,
    termite: count.termite * keep * (upFor(settings, a, 'termite') + termiteInitial(settings, a, termiteInit)),
    mosquito: count.mosquito * keep * upFor(settings, a, 'mosquito'),
  };
  const earned = GROUPS.reduce((t, g) => t + by[g], 0);
  // Salary plan: the salary is guaranteed; commission above it comes in the quarter checks
  const salaryYear = a.plan === 'salary' ? n(a.salary) * 52 : 0;
  const year = a.plan === 'salary' ? Math.max(earned, salaryYear) : earned;
  const upfront = a.plan === 'salary' ? salaryYear : total * upAmt + count.termite * termiteInitial(settings, a, termiteInit);   // up fronts go out on every serviced sale
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
const upFor = (settings, a, g) => (a?.plan === 'salary' ? commissionUpfront(settings, a) : upfrontFor(settings, a, g));

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

// ---------- customer list ----------
/**
 * Where a not-yet-done first service stands. FieldRoutes says "No Show" whenever the tech couldn't do
 * it, so that word isn't shown: Scheduled (booked, still ahead), Rescheduled (a new date is booked),
 * Needs a new date (still active, nothing booked), or Canceled.
 */
export function firstService(x, today) {
  // A canceled first appointment on a service that's still active usually means it's being moved
  if (x.live === false || (x.live === undefined && /cancel/i.test(x.st || ''))) return { key: 'canceled', label: 'Canceled', short: 'Canceled', note: 'no pay', tone: 'muted' };
  if (x.st === 'Pending' && x.on && x.on >= today) return { key: 'scheduled', label: 'Scheduled', short: nice(x.on), note: `first service ${nice(x.on)}` };
  if (x.next) return { key: 'rescheduled', label: 'Rescheduled', short: nice(x.next), note: `new date ${nice(x.next)}` };
  return { key: 'needs', label: 'Needs a new date', short: 'Not done', note: 'couldn’t be done; office to reschedule', tone: 'warn' };
}

/**
 * Every customer a rep added this year (plus last year's that canceled this year), with what the
 * sale earns, what has been paid on it, what is left, and any deduction. `open` = sales not serviced yet.
 */
export function customers(st, open, today) {
  const s = st.settings || {};
  const a = st.plan;
  const flat = a?.plan === 'flat';
  const hold = n(s.hold_pct) / 100;
  const now = st.quarters[st.quarters.length - 1];
  const lineNow = Object.fromEntries((now?.lines || []).map((l) => [l.id, l]));
  const paidQs = st.quarters.filter((q) => q.payDate <= today).reverse();
  const nextQ = st.quarters.find((q) => q.payDate > today);
  const rows = [];

  // A canceled or past-due sale: what was paid on it comes back out of the quarter checks. A Q1–Q3
  // check takes back (100 − hold)% of it (the rest comes out with the hold in January).
  const takeBack = (row, x) => {
    const q = paidQs.find((y) => y.lines.some((l) => l.id === x.id && !l.good));
    const taken = q ? cents(row.paid * (q.q < 4 ? 1 - hold : 1)) : 0;
    row.deduction = -taken;
    row.left = -cents(row.paid - taken);
    const when = q ? `of the held amount on ${nice(`${st.year + 1}-01-20`)}` : nextQ ? `of the ${nice(nextQ.payDate)} check` : 'of the next check';
    row.note = row.paid === 0 ? 'no pay' : row.left < 0 ? `${money(-row.left)} comes out ${when}` : 'taken back';
  };

  st.sales.forEach((x) => {
    const up = a ? cents(saleUpfront(s, a, x)) : 0;
    const monday = payMonday(x.served);
    let paid = monday <= today ? up : 0;
    if (a && !flat) {
      for (const q of paidQs) {
        const l = q.lines.find((y) => y.id === x.id);
        if (l) {
          if (l.good && l.g === 'pest') paid = up + Math.max(0, l.earned - l.upfront) * (q.q < 4 ? 1 - hold : 1);
          break;
        }
      }
    }
    paid = cents(paid);
    const l = lineNow[x.id];
    const earned = !a ? 0 : flat ? up : cents(l ? l.earned : up);
    const cancelled = x.can && daysBetween(x.served, x.can) <= n(s.clawback_days);
    const row = { ...x, kind: 'sale', up, earned, paid, left: 0, deduction: 0, rate: l?.rate ?? null, bonus: l && l.bonus > (now?.rate || 0) };
    if (!a) {
      row.status = 'No pay plan yet';
    } else if (cancelled && !flat) {
      row.status = `Canceled ${nice(x.can)}`;
      row.earned = 0;
      takeBack(row, x);
      row.tone = 'bad';
    } else if (cancelled) {
      row.status = `Canceled ${nice(x.can)}`;
      row.note = 'flat rate: no deduction';
      row.tone = 'bad';
    } else if (!flat && n(x.bal) > 0 && n(x.age) > n(s.past_due_days)) {
      row.status = `Past due ${x.age} days`;
      takeBack(row, x);
      row.note = `${row.note}; paid again once they pay`;
      row.tone = 'warn';
    } else {
      row.left = cents(Math.max(0, earned - paid));
      if (row.left <= 0) { row.status = 'Paid in full'; row.tone = 'good'; } else if (paid > 0) {
        row.status = 'Partly paid';
        row.note = nextQ ? `next check ${nice(nextQ.payDate)}` : '';
      } else {
        row.status = 'Not paid yet';
        row.note = `pays ${nice(monday)}`;
      }
    }
    rows.push(row);
  });

  (st.priorClawbacks || []).forEach((x) => rows.push({
    ...x, kind: 'prior', earned: 0, paid: 0, left: 0, deduction: -x.amount, status: `Canceled ${nice(x.can)}`, note: `${x.served.slice(0, 4)} sale, taken back`, tone: 'bad',
  }));

  (open || []).forEach((x) => {
    const st = firstService(x, today);
    const up = a ? cents(saleUpfront(s, a, x)) : 0;
    const coming = st.key !== 'canceled';
    rows.push({
      ...x, kind: 'open', served: null, svc: st, up, earned: coming ? up : 0, paid: 0, left: coming ? up : 0, deduction: 0,
      status: st.label, note: st.note, tone: st.tone,
    });
  });

  rows.sort((p, q) => ((q.served || q.sold) > (p.served || p.sold) ? 1 : -1));
  const sum = (k) => cents(rows.reduce((t, r) => t + n(r[k]), 0));
  return { rows, totals: { earned: sum('earned'), paid: sum('paid'), left: sum('left'), deduction: sum('deduction') } };
}
