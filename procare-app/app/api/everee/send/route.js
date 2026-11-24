import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { createPayable, requestPayout } from '@/lib/everee';
import { loadEveree } from '@/lib/evereeLoad';

export const dynamic = 'force-dynamic';

/**
 * Sales → Pay → Everee buttons (change 91). Body: { action: 'send' | 'payout', payday: 'YYYY-MM-DD', reps: [ids] }.
 *   send:   creates each rep's payable in Everee (pending; nothing is paid) and logs it. Amounts are re-figured here.
 *   payout: asks Everee to pay that payday's sent items for those reps (1099 contractors). Paid once approved in Everee.
 * Only people who manage sales pay.
 */
export async function POST(request) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: boss } = await supabase.rpc('can_manage_pay');
  if (!me || !boss) return NextResponse.json({ error: 'Only people who manage sales pay can send to Everee.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body.action === 'payout' ? 'payout' : body.action === 'send' ? 'send' : null;
  const payday = /^\d{4}-\d{2}-\d{2}$/.test(body.payday || '') ? body.payday : null;
  const want = new Set(Array.isArray(body.reps) ? body.reps.map(String) : []);
  if (!action || !payday || !want.size) return NextResponse.json({ error: 'Pick a payday and at least one rep.' }, { status: 400 });

  // The log table (change 91) must exist first, so nothing is sent without a record
  const probe = await supabase.from('everee_payables').select('external_id').limit(1);
  if (probe.error) return NextResponse.json({ error: 'Run database change 91 in Supabase first, so every send is recorded.' }, { status: 400 });

  let ev;
  try { ev = await loadEveree(supabase, { payday, today: todayYmd() }); } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
  if (!ev.configured) return NextResponse.json({ error: 'The Everee keys aren’t in Vercel.' }, { status: 400 });
  const rows = (ev.rows || []).filter((r) => want.has(r.id));
  const results = [];

  if (action === 'send') {
    for (const r of rows) {
      if (!r.payable) { results.push({ id: r.id, name: r.name, ok: false, message: r.amount > 0 ? 'Not matched to an Everee worker.' : 'Nothing owed.' }); continue; }
      const prev = ev.sent[r.payable.externalId];
      if (prev?.status === 'payout_requested') { results.push({ id: r.id, name: r.name, ok: false, message: 'Payout already requested for this payday.' }); continue; }
      const row = {
        external_id: r.payable.externalId, employee_id: r.id, payday, amount: r.amount, label: r.payable.label,
        everee_worker_id: String(r.payable.workerId || r.payable.externalWorkerId), sent_by: me.id, sent_at: new Date().toISOString(),
      };
      try {
        await createPayable(r.payable);
        await supabase.from('everee_payables').upsert({ ...row, status: 'sent', message: null });
        results.push({ id: r.id, name: r.name, ok: true, amount: r.amount });
      } catch (e) {
        await supabase.from('everee_payables').upsert({ ...row, status: prev?.status === 'sent' ? 'sent' : 'error', message: e.message });
        results.push({ id: r.id, name: r.name, ok: false, message: e.message });
      }
    }
  } else {
    // Only items sent at today's amount: if pay changed since sending, send again first
    const ready = rows.filter((r) => r.payable && ev.sent[r.payable.externalId]?.status === 'sent'
      && Number(ev.sent[r.payable.externalId].amount) === Number(r.amount));
    rows.filter((r) => !ready.includes(r)).forEach((r) => results.push({ id: r.id, name: r.name, ok: false, message: 'Not sent to Everee at today’s amount yet.' }));
    if (ready.length) {
      const ids = ready.map((r) => r.payable.externalId);
      try {
        const res = await requestPayout(ids);
        await supabase.from('everee_payables').update({
          status: 'payout_requested', payout_requested_by: me.id, payout_requested_at: new Date().toISOString(), payout_request_id: res?.id ? String(res.id) : null, message: null,
        }).in('external_id', ids);
        ready.forEach((r) => results.push({ id: r.id, name: r.name, ok: true, amount: r.amount }));
      } catch (e) {
        ready.forEach((r) => results.push({ id: r.id, name: r.name, ok: false, message: e.message }));
      }
    }
  }
  return NextResponse.json({ action, payday, results });
}
