/**
 * Wildlife pay (change 65). wildlife_pay_data() gives the wildlife jobs whose first visit was completed in the pay
 * period (that's when pay is earned), with who sold, did and referred each, plus each person's plan.
 * Commission plan: sell_pct of the basis to the seller, work_pct to whoever did the first visit (defaults 10% / 25%).
 * Basis: Exclusion and Insulation, the initial job only; Trapping, the entire job. Warranty and reservices never pay.
 * Salary plan: salary for the period + job_bonus for each job whose first visit they did.
 * Referrals: Sales Rep 2 gets the referral amount ($100) per job.
 * Split jobs and the office assist: change 74 (jobShares below).
 */
export const DEFAULT_PLAN = { plan: 'commission', sell_pct: 10, work_pct: 25, salary: 0, job_bonus: 0 };
export const LINE_LABEL = { exclusion: 'Exclusion', insulation: 'Insulation', trapping: 'Trapping' };
export const BASIS_LABEL = { exclusion: 'initial job', insulation: 'initial job', trapping: 'entire job' };

const n = (x) => Number(x) || 0;
const round2 = (x) => Math.round(x * 100) / 100;

export function planFor(plans, id) {
  const p = (plans || []).find((x) => x.employee_id === id);
  return { ...DEFAULT_PLAN, ...(p || {}), saved: !!p };
}

/**
 * Each job's pay, worked out once (change 74):
 *  * sellAmt / workAmt: what the job's commission is (the seller's selling %, the worker's work %; only team members
 *    on the commission plan earn it). Split on: shared evenly by every team member on the commission plan.
 *  * Office assist on: assist_amount comes out of the team's pay (split: evenly; otherwise the seller, or the worker if
 *    the seller isn't on the team) and goes to whoever has the office assist switched on in their profile.
 * Returns { [jobId]: { [personId]: { sell, work, bonus, assist } } }.
 */
function jobShares(d) {
  const crew = d.crew || d.team || [];
  const plans = Object.fromEntries(crew.map((c) => [c.id, planFor(d.plans, c.id)]));
  const commission = crew.filter((c) => plans[c.id].plan === 'commission').map((c) => c.id);
  const assistAmt = n(d.assist_amount ?? 100);
  const hasAssistant = (d.assistants || []).length > 0;
  const out = {};
  (d.jobs || []).forEach((j) => {
    const basis = n(j.basis);
    const sp = plans[j.seller];
    const wp = plans[j.worker];
    const sellAmt = sp && sp.plan === 'commission' ? (basis * n(sp.sell_pct)) / 100 : 0;
    const workAmt = wp && wp.plan === 'commission' ? (basis * n(wp.work_pct)) / 100 : 0;
    const shares = {};
    const add = (id, k, v) => { const r = (shares[id] ||= { sell: 0, work: 0, bonus: 0, assist: 0 }); r[k] += v; };
    const splitting = j.split !== false && commission.length > 1 && (sellAmt > 0 || workAmt > 0);
    if (splitting) {
      commission.forEach((id) => { add(id, 'sell', sellAmt / commission.length); add(id, 'work', workAmt / commission.length); });
    } else {
      if (sellAmt) add(j.seller, 'sell', sellAmt);
      if (workAmt) add(j.worker, 'work', workAmt);
    }
    if (wp && wp.plan === 'salary') add(j.worker, 'bonus', n(wp.job_bonus));
    if (j.assist && hasAssistant && assistAmt > 0) {
      const payers = splitting ? commission : [plans[j.seller] ? j.seller : j.worker].filter((id) => plans[id]);
      payers.forEach((id) => add(id, 'assist', assistAmt / payers.length));
    }
    if (sp && !shares[j.seller]) add(j.seller, 'sell', 0);   // the seller still sees the job
    if (wp && !shares[j.worker]) add(j.worker, 'work', 0);
    out[j.id] = shares;
  });
  return out;
}

/** One entry per wildlife person shown: { id, name, plan, lines: [...], sell, work, bonus, assist, salary, total } */
export function buildWildlifePay(data) {
  const d = data || {};
  const jobs = d.jobs || [];
  const shares = jobShares(d);
  return (d.team || []).map((t) => {
    const plan = planFor(d.plans, t.id);
    const lines = [];
    jobs.forEach((j) => {
      const s = shares[j.id]?.[t.id];
      if (!s) return;
      const sell = round2(s.sell);
      const work = round2(s.work);
      const bonus = round2(s.bonus);
      const assist = round2(s.assist);
      lines.push({ ...j, sold: j.seller === t.id, did: j.worker === t.id, sell, work, bonus, assist, pay: round2(sell + work + bonus - assist) });
    });
    const sum = (k) => round2(lines.reduce((a, l) => a + l[k], 0));
    const salary = plan.plan === 'salary' ? n(plan.salary) : 0;
    return { id: t.id, name: t.name, plan, lines, sell: sum('sell'), work: sum('work'), bonus: sum('bonus'), assist: sum('assist'), salary,
      total: round2(sum('sell') + sum('work') + sum('bonus') - sum('assist') + salary) };
  });
}

/** The office assist to pay this period (on the pay report, not cash out): { amount, person, jobs, total } or null. */
export function buildAssists(data) {
  const d = data || {};
  const amt = n(d.assist_amount ?? 100);
  const person = (d.assistants || [])[0] || null;
  const jobs = (d.jobs || []).filter((j) => j.assist);
  return { amount: amt, person, others: (d.assistants || []).slice(1), jobs, total: person ? round2(jobs.length * amt) : 0 };
}

/** Referrals to pay: Sales Rep 2 on a wildlife job (not the same person as the seller). */
export function buildReferrals(data) {
  const d = data || {};
  const amt = n(d.referral_amount ?? 100);
  const by = {};
  (d.jobs || []).forEach((j) => {
    if (!j.referrer || j.referrer === j.seller) return;
    const r = (by[j.referrer] ||= { id: j.referrer, name: d.people?.[j.referrer] || 'Unknown', jobs: [], total: 0 });
    r.jobs.push(j);
    r.total = round2(r.total + amt);
  });
  return { amount: amt, list: Object.values(by).sort((a, b) => b.total - a.total) };
}
