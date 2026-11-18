'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DEPT_LABEL, OFFICE_NAME } from '@/lib/labels';
import { BugTile } from '../../Bug';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
const where = (p) => (p?.department === 'sales' ? 'Sales rep · pay as usual (Everee later)' : 'Enter in ADP');

function Card({ r, onPaid, onEdit, onDelete }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('');   // '', 'edit', 'delete'
  const [amt, setAmt] = useState(String(r.amount));
  const [editNote, setEditNote] = useState(r.note || '');
  const run = async (fn) => { setBusy(true); const ok = await fn(); setBusy(false); if (ok) setMode(''); };
  const p = r.person || {};
  return (
    <li className={`payout-card${r.status === 'paid' ? ' paid' : ''}`}>
      <div className="payout-head">
        <span className="cp-h"><BugTile kind={p.department === 'sales' ? 'ant' : p.department === 'technician' ? 'spider' : 'cricket'} tone={r.status === 'paid' ? 'sage' : 'forest'} size={30} />
          <span><b>{p.first_name} {p.last_name}</b><br /><small className="note">{DEPT_LABEL[p.department] || ''}{p.office ? ` · ${OFFICE_NAME[p.office]}` : ''} · requested {day(r.requested_at)}</small></span>
        </span>
        <span className="payout-amt">{money(r.amount)}</span>
      </div>
      <span className="payout-where">{where(p)}</span>
      {r.items.length > 0 && <ul className="payout-items">{r.items.map((a, i) => <li key={i}>{a.reason}: {money(a.amount)}</li>)}</ul>}
      {r.status === 'paid' ? (
        <p className="ok">Paid {day(r.paid_at)}{r.note ? ` · ${r.note}` : ''}</p>
      ) : (
        <div className="calc-row">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. on the 11/21 payroll" maxLength={160} style={{ flex: '1 1 240px' }} />
          <button type="button" className="btn btn-small" disabled={busy} onClick={async () => { setBusy(true); await onPaid(r, note); setBusy(false); }}>Mark as paid</button>
        </div>
      )}
      {mode === 'edit' && (
        <div className="calc-row">
          <span className="calc-input"><span className="calc-affix">$</span>
            <input type="number" min="0.01" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount" /></span>
          <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Note (optional)" maxLength={160} style={{ flex: '1 1 200px' }} aria-label="Note" />
          <button type="button" className="btn btn-small" disabled={busy || !(Number(amt) > 0)} onClick={() => run(() => onEdit(r, Number(amt), editNote))}>Save</button>
          <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => setMode('')}>Cancel</button>
        </div>
      )}
      {mode === 'delete' && (
        <div className="payout-delete">
          <p className="note">Delete this {money(r.amount)} request? Choose what happens to the prizes in it.</p>
          <div className="calc-row">
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => run(() => onDelete(r, true))}>Delete, send prizes back to Earnings</button>
            <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => run(() => onDelete(r, false))}>Delete for good (won’t be paid)</button>
            <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => setMode('')}>Keep it</button>
          </div>
        </div>
      )}
      {!mode && (
        <div className="payout-tools">
          <button type="button" className="link" onClick={() => setMode('edit')}>Edit</button>
          <button type="button" className="link" onClick={() => setMode('delete')}>Delete</button>
        </div>
      )}
    </li>
  );
}

export default function PayoutList({ requests }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [status, setStatus] = useState('');
  const open = requests.filter((r) => r.status === 'requested');
  const paid = requests.filter((r) => r.status === 'paid');

  const onPaid = async (r, note) => {
    setStatus('Saving…');
    const { data: done, error } = await sb.rpc('mark_payout_paid', { p_id: r.id, p_note: note });
    if (error || !done) { setStatus(error ? `Couldn’t save: ${error.message}` : 'It was already marked paid.'); router.refresh(); return; }
    const res = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'payout_paid', id: r.id }) })
      .then((x) => x.json()).catch(() => ({}));
    setStatus(res.sent ? `Marked paid and emailed ${r.person?.first_name}.` : `Marked paid.${res.problem ? ` ${res.problem}` : ''}`);
    router.refresh();
  };

  const onEdit = async (r, amount, note) => {
    setStatus('Saving…');
    const { data: ok, error } = await sb.rpc('update_payout', { p_id: r.id, p_amount: amount, p_note: note });
    setStatus(error || !ok ? `Couldn’t save: ${error?.message || 'not allowed'}` : `Saved ${r.person?.first_name}’s request: ${money(amount)}.`);
    router.refresh();
    return !error && ok;
  };

  const onDelete = async (r, keep) => {
    setStatus('Deleting…');
    const { data: ok, error } = await sb.rpc('delete_payout', { p_id: r.id, p_keep_prizes: keep });
    setStatus(error || !ok ? `Couldn’t delete: ${error?.message || 'not allowed'}`
      : keep ? `Deleted. ${r.person?.first_name}’s prizes are back in their Earnings.` : `Deleted ${r.person?.first_name}’s request and its prizes.`);
    router.refresh();
    return !error && ok;
  };

  return (
    <>
      {status && <p className="pay-status" role="status">{status}</p>}
      <h2>Waiting to be paid ({open.length})</h2>
      {open.length ? <ul className="payouts-list">{open.map((r) => <Card key={r.id} r={r} onPaid={onPaid} onEdit={onEdit} onDelete={onDelete} />)}</ul> : <p className="note">Nothing waiting. 🎉</p>}
      {paid.length > 0 && (
        <>
          <h2 className="spaced">Paid</h2>
          <ul className="payouts-list">{paid.map((r) => <Card key={r.id} r={r} onPaid={onPaid} onEdit={onEdit} onDelete={onDelete} />)}</ul>
        </>
      )}
    </>
  );
}
