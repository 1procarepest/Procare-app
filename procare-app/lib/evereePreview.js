import { addDays, cents, nice, statement } from './comp';

/**
 * Sales → Pay → Everee (preview, 2026-11-23): what the app WOULD send Everee for a Monday payday. Nothing is sent.
 * One payable per rep: their up fronts for sales serviced the week before (the same numbers as the Statement's
 * "Weekly up fronts"). Quarter checks come later.
 *
 * Each row carries the exact payable it would create (POST /integration/v1/payables), so the preview, the
 * small test and the real thing all use the same shape. externalId is fixed per rep + payday: sending it twice
 * updates the same unpaid item instead of paying twice.
 */

const norm = (s) => String(s || '').trim().toLowerCase();
const nameKey = (first, last) => `${norm(first).split(/\s+/)[0]}|${norm(last).split(/\s+/).pop()}`;

/** Match an app rep to an Everee worker: email first, then first + last name. */
export function matchWorker(rep, emp, workers) {
  const email = norm(emp?.email);
  if (email) {
    const w = workers.find((x) => norm(x.email) === email);
    if (w) return { w, by: 'email' };
  }
  const key = nameKey(emp?.first_name || rep.name.split(' ')[0], emp?.last_name || rep.name.split(' ').slice(1).join(' '));
  const byName = workers.filter((x) => nameKey(x.firstName, x.lastName) === key);
  if (byName.length === 1) return { w: byName[0], by: 'name' };
  if (byName.length > 1) return { w: null, by: 'several' };
  return { w: null, by: null };
}

/** Noon Eastern on the Sunday that ends the sales week, in Unix seconds (Everee's earningTimestamp). */
const earningAt = (ymd) => Math.floor(new Date(`${ymd}T17:00:00Z`).getTime() / 1000);

export function payablePreview({ data, year, payday, today, workers, emps }) {
  const empById = Object.fromEntries((emps || []).map((e) => [e.id, e]));
  const rows = (data.reps || []).map((rep) => {
    const st = statement(data, rep.id, year, today);
    const wk = st.weeks.find((w) => w.payday === payday);
    const amount = cents(wk?.total || 0);
    const emp = empById[rep.id];
    const m = matchWorker(rep, emp, workers);
    const from = addDays(payday, -7), to = addDays(payday, -1);
    const payable = amount > 0 && m.w ? {
      externalId: `procare::${rep.id}::upfront::${payday}`,
      ...(/^\d+$/.test(String(m.w.id)) ? { workerId: String(m.w.id) } : { externalWorkerId: String(m.w.id) }),
      type: 'commission',
      label: `Sales up fronts, ${nice(from)}–${nice(to)}`,
      payableModel: 'PRE_CALCULATED',
      payCode: 'COMMISSION',
      amount: { amount, currency: 'USD' },
      earningTimestamp: earningAt(to),
    } : null;
    return {
      id: rep.id, name: rep.name, office: rep.office, active: rep.active, plan: st.plan?.plan || null,
      sales: wk?.sales.length || 0, amount, email: emp?.email || '',
      worker: m.w ? { id: m.w.id, name: `${m.w.firstName || ''} ${m.w.lastName || ''}`.trim(), email: m.w.email || '', onboarded: m.w.onboardingComplete !== false } : null,
      matchedBy: m.by, payable,
    };
  }).filter((r) => r.amount > 0 || r.active);
  rows.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return {
    rows,
    total: cents(rows.reduce((t, r) => t + r.amount, 0)),
    ready: rows.filter((r) => r.payable).length,
    blocked: rows.filter((r) => r.amount > 0 && !r.payable).length,
  };
}
