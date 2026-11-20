/**
 * Wildlife pay (change 65). wildlife_pay_data() gives the wildlife jobs whose first visit was completed in the pay
 * period (that's when pay is earned), with who sold, did and referred each, plus each person's plan.
 * Commission plan: sell_pct of the basis to the seller, work_pct to whoever did the first visit (defaults 10% / 25%).
 * Basis: Exclusion and Insulation, the initial job only; Trapping, the entire job. Warranty and reservices never pay.
 * Salary plan: salary for the period + job_bonus for each job whose first visit they did.
 * Referrals: Sales Rep 2 gets the referral amount ($100) per job.
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

/** One entry per wildlife person: { id, name, plan, lines: [...], sell, work, bonus, salary, total } */
export function buildWildlifePay(data) {
  const d = data || {};
  const jobs = d.jobs || [];
  return (d.team || []).map((t) => {
    const plan = planFor(d.plans, t.id);
    const lines = [];
    jobs.forEach((j) => {
      const sold = j.seller === t.id;
      const did = j.worker === t.id;
      if (!sold && !did) return;
      const basis = n(j.basis);
      const sell = plan.plan === 'commission' && sold ? round2((basis * n(plan.sell_pct)) / 100) : 0;
      const work = plan.plan === 'commission' && did ? round2((basis * n(plan.work_pct)) / 100) : 0;
      const bonus = plan.plan === 'salary' && did ? n(plan.job_bonus) : 0;
      lines.push({ ...j, sold, did, sell, work, bonus, pay: round2(sell + work + bonus) });
    });
    const sum = (k) => round2(lines.reduce((a, l) => a + l[k], 0));
    const salary = plan.plan === 'salary' ? n(plan.salary) : 0;
    return { id: t.id, name: t.name, plan, lines, sell: sum('sell'), work: sum('work'), bonus: sum('bonus'), salary,
      total: round2(sum('sell') + sum('work') + sum('bonus') + salary) };
  });
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
