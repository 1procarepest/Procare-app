'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usDate } from '@/lib/trucks';
import Toggle from '../../Toggle';

/** Send a queued driver email now. */
export async function sendDriverNotice(id) {
  const res = await fetch('/api/driver-notice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  const j = await res.json().catch(() => ({}));
  return { ok: !!j.ok, text: j.text || `Email error ${res.status}` };
}

/** Where the last add / remove email stands. */
export function EmailStatus({ ev, agent }) {
  if (!ev) return null;
  const what = ev.kind === 'added' ? 'Add' : 'Remove';
  if (ev.emailed_at) return <span className="note">{what} email sent to {agent || 'insurance'} {usDate(ev.emailed_at.slice(0, 10))}</span>;
  return <span className="error">{what} email not sent yet{ev.email_result ? `: ${ev.email_result}` : ''}</span>;
}

/**
 * One person's driver details and the Approved driver switch (C-Suite, the President, HR with the authenticator step).
 * Used on Operations → Drivers and on the person's Settings page.
 */
export default function DriverEditor({ p, agent }) {
  const router = useRouter();
  const [f, setF] = useState({ license_state: p.license_state || 'GA', license_number: p.license_number || '', birth_date: p.birth_date || '', home_address: p.home_address || '' });
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  const agentFirst = (agent?.name || '').split(' ')[0] || 'insurance';

  const saveDetails = async () => {
    const { error } = await createClient().rpc('save_driver_license', { p_employee: p.id, p: f });
    if (error) { setM({ ok: false, text: error.message }); return false; }
    return true;
  };
  const save = async () => {
    setBusy(true); setM(null);
    if (await saveDetails()) setM({ ok: true, text: 'Saved.' });
    setBusy(false); router.refresh();
  };
  const flip = async (on) => {
    if (!on && !window.confirm(`Take ${p.first_name} off the driver list? ${agentFirst} gets an email to remove them from the policy.`)) return;
    setBusy(true); setM(null);
    if (on && !(await saveDetails())) { setBusy(false); return; }
    const { data: ev, error } = await createClient().rpc('set_approved_driver', { p_employee: p.id, p_on: on });
    if (error) { setBusy(false); setM({ ok: false, text: error.message }); return; }
    setM(ev ? await sendDriverNotice(ev) : { ok: true, text: 'Saved.' });
    setBusy(false); router.refresh();
  };
  const resend = async () => {
    setBusy(true);
    setM(await sendDriverNotice(p.last_event.id));
    setBusy(false); router.refresh();
  };

  return (
    <div className="tr-sec drv-edit">
      <Toggle checked={p.approved_driver} disabled={busy} onChange={flip}>
        <span>Approved driver</span>
        <span className="note">{p.approved_driver ? `On the company auto policy. Switching off emails ${agentFirst} to remove them.` : `Switching on emails ${agentFirst} to add them (with their birth date and license).`}</span>
      </Toggle>
      <div className="tr-grid">
        <label className="tr-field"><span>License state</span><input value={f.license_state} maxLength={20} onChange={(e) => setF({ ...f, license_state: e.target.value })} /></label>
        <label className="tr-field"><span>License number</span><input value={f.license_number} autoComplete="off" onChange={(e) => setF({ ...f, license_number: e.target.value })} /></label>
        <label className="tr-field"><span>Birth date</span><input type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></label>
        <label className="tr-field tr-wide"><span>Home address (stays in the app; not emailed)</span><input value={f.home_address} autoComplete="off" onChange={(e) => setF({ ...f, home_address: e.target.value })} /></label>
      </div>
      <div className="panel-buttons">
        <button type="button" className="btn btn-small" disabled={busy} onClick={save}>Save details</button>
        {p.last_event && !p.last_event.emailed_at && p.last_event.kind !== 'list' && (
          <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={resend}>Send the {p.last_event.kind === 'added' ? 'add' : 'remove'} email</button>
        )}
      </div>
      <EmailStatus ev={p.last_event} agent={agent?.name} />
      {m && <p className={m.ok ? 'ok' : 'error'} role="status">{m.text}</p>}
    </div>
  );
}
