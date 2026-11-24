// Server only. The Everee tab's numbers for one payday, used by the page and by /api/everee/send, so what gets sent is
// always figured on the server from the pay data, never taken from the browser.
import { createAdminClient } from './supabase/admin';
import { evereeConfigured, evereeEnv, evereeWorkers } from './everee';
import { payablePreview } from './evereePreview';

export async function loadEveree(supabase, { payday, today, data = null }) {
  const out = { payday, configured: evereeConfigured(), env: evereeEnv(), sent: {} };
  if (!out.configured) return out;
  const payYear = Number(payday.slice(0, 4));
  const pay = data && Number(data.year ?? payYear) === payYear ? data : (await supabase.rpc('comp_sales', { p_year: payYear })).data;
  if (!pay) throw new Error('Pay data couldn’t load.');
  const admin = createAdminClient();
  const ids = (pay.reps || []).map((r) => r.id);
  const [workers, emps, log] = await Promise.all([
    evereeWorkers(),
    admin ? admin.from('employees').select('id, first_name, last_name, email').in('id', ids).then((r) => r.data || []) : [],
    // What was already sent for this payday (change 91); empty until that change is run
    supabase.from('everee_payables').select('*').eq('payday', payday).then((r) => ({ rows: r.data || [], missing: !!r.error })),
  ]);
  Object.assign(out, payablePreview({ data: pay, year: payYear, payday, today, workers, emps }), { workerCount: workers.length });
  out.sent = Object.fromEntries(log.rows.map((r) => [r.external_id, r]));
  out.logMissing = log.missing;
  return out;
}
