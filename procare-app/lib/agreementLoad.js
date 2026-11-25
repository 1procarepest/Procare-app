// Server only. Sales agreements (change 93): each rep's agreement for a year, written from their plan, and where it
// stands (signed, waiting for ProCare, needs a new signature). Used by Onboarding, the agreement page and /api/agreement,
// so the wording a rep signs is always rebuilt here, never taken from the browser.
import { createAdminClient } from './supabase/admin';
import { buildAgreement } from './salesAgreement';

export const AGREEMENT_DEFAULTS = {
  company: 'ProCare Sales, LLC', company_desc: 'a Georgia limited liability company', address: '3850 Canton Rd. Ste. 3118, Marietta, GA 30066',
  county: 'Cobb County, Georgia', signer_name: '', signer_title: 'President', schedule: '', pricing: '', equipment: '',
};

/** Where one agreement stands. */
export function stateOf(current, signed) {
  const mine = signed.filter((r) => r.employee_id === current.employee_id && r.year === current.year)
    .sort((x, y) => (x.signed_at < y.signed_at ? 1 : -1));
  const now = mine.find((r) => r.hash === current.hash);
  if (now) return { key: now.company_signed_at ? 'done' : 'company', row: now, older: mine.filter((r) => r !== now) };
  return { key: mine.length ? 'resign' : 'unsigned', row: null, older: mine };
}

/**
 * Agreements for `years` (e.g. [2026, 2027]). onlyEmp limits it to one person. The supabase client is the signed-in
 * person's, so plans are only those they may see (their own, or everyone's for pay managers).
 * Returns { ready, co, list: [{ employee_id, name, year, agreement, state }] } or { ready: false } before change 93.
 */
export async function loadAgreements(supabase, { years, onlyEmp = null }) {
  let q = supabase.from('comp_assignments').select('*').in('year', years);
  if (onlyEmp) q = q.eq('employee_id', onlyEmp);
  const [plansR, settingsR, coR, signedR] = await Promise.all([
    q,
    supabase.from('comp_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('agreement_settings').select('*').eq('id', 1).maybeSingle(),
    (() => { let s = supabase.from('sales_agreements').select('*').in('year', years); if (onlyEmp) s = s.eq('employee_id', onlyEmp); return s; })(),
  ]);
  if (coR.error || signedR.error) return { ready: false, list: [] };
  const plans = plansR.data || [];
  const ids = [...new Set(plans.map((p) => p.employee_id))];
  const admin = createAdminClient();
  const { data: emps } = ids.length && admin
    ? await admin.from('employees').select('id, first_name, last_name, office, active').in('id', ids)
    : { data: [] };
  const byId = Object.fromEntries((emps || []).map((e) => [e.id, e]));
  const co = { ...AGREEMENT_DEFAULTS, ...(coR.data || {}) };
  const signed = signedR.data || [];
  const list = plans.filter((p) => byId[p.employee_id]).map((p) => {
    const e = byId[p.employee_id];
    const name = `${e.first_name || ''} ${e.last_name || ''}`.trim();
    const agreement = buildAgreement({ rep: { name }, plan: p, settings: settingsR.data || {}, co, year: p.year });
    const current = { employee_id: p.employee_id, year: p.year, hash: agreement.hash };
    return { employee_id: p.employee_id, name, office: e.office, active: e.active, year: p.year, plan: p.plan, agreement, state: stateOf(current, signed) };
  }).sort((x, y) => x.year - y.year || x.name.localeCompare(y.name));
  return { ready: true, co, list };
}
