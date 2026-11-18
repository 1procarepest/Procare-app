'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, roleTitle, timeOffWhen } from '@/lib/labels';
import Face from '../../Face';

const STATUS = { pending: 'Waiting', approved: 'Approved', denied: 'Denied', cancelled: 'Cancelled' };

/**
 * Who approves time off (the database enforces the same rule in can_approve_time_off):
 * sales requests go to a sales manager or the President; everyone else's go to the
 * HR approver or the President. Nobody but the President decides their own.
 */
function canApprove(me, r) {
  if (me.level === 'president') return true;
  if (r.employee_id === me.id) return false;
  if (r.employee?.department === 'sales') return me.department === 'sales' && me.level === 'manager';
  return me.hr_approver;
}

function headNote(me) {
  if (me.level === 'president') return 'You can approve or deny any request.';
  if (me.department === 'sales' && me.level === 'manager') {
    return me.hr_approver
      ? 'You approve time off for the sales team and give final approval for everyone else.'
      : 'You approve time off for the sales team. Everyone else’s requests go to HR.';
  }
  if (me.hr_approver) return 'You give final approval on these requests. Sales team requests go to the sales manager or the President.';
  if (me.department === 'sales') return 'Requests from your team. The sales manager or the President approves them.';
  return 'Requests from your team. Final approval is given by HR.';
}

function Request({ r, canDecide }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const e = r.employee || {};

  async function decide(status) {
    setBusy(true);
    setError('');
    const { data, error: err } = await createClient()
      .from('time_off_requests')
      .update({ status, decision_note: note.trim() || null })
      .eq('id', r.id)
      .select('id');
    setBusy(false);
    if (err) { setError(err.message); return; }
    // Supabase skips rows the database's permission rules don't allow, without an error.
    if (!data || data.length === 0) {
      setError('This request wasn’t updated. The database didn’t allow the change for your account.');
      return;
    }
    // Email the employee about the decision (switch: Email settings → time_off_decision)
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'time_off_decided', id: r.id }),
      keepalive: true,
    }).catch(() => {});
    router.refresh();
  }

  return (
    <li className="request">
      <div className="request-main">
        <span className="person-name with-face"><Face person={e} size={32} />{e.first_name} {e.last_name}</span>
        <span className="person-role">{roleTitle(e.department, e.level)}, {OFFICE_NAME[e.office] || 'No office'}</span>
        <span>
          {timeOffWhen(r)}
          {r.use_pto && <> <span className="badge badge-pto">Paid vacation</span></>}
        </span>
        {r.note && <span className="note">“{r.note}”</span>}
        {r.decision_note && <span className="note">Reply: {r.decision_note}</span>}
      </div>
      <span className={`badge status-${r.status}`}>
        {r.status === 'approved' && e.department === 'sales' && r.decided_by === r.employee_id ? 'Notice' : STATUS[r.status]}
      </span>
      {canDecide && r.status === 'pending' && (
        <div className="decide">
          <input placeholder="Reply to the employee (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} aria-label="Reply" />
          <div className="panel-buttons">
            <button className="btn" type="button" disabled={busy} onClick={() => decide('approved')}>Approve</button>
            <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => decide('denied')}>Deny</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </li>
  );
}

export default function TimeOffList({ requests, me }) {
  const waiting = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending')
    .sort((a, b) => String(b.decided_at || b.created_at).localeCompare(String(a.decided_at || a.created_at)))
    .slice(0, 40);

  return (
    <section className="section">
      <div className="admin-head">
        <h1>Time off</h1>
        <p className="note">
          {headNote(me)}
        </p>
      </div>

      <h2>Waiting for a decision ({waiting.length})</h2>
      <ul className="requests">
        {waiting.map((r) => <Request key={r.id} r={r} canDecide={canApprove(me, r)} />)}
        {waiting.length === 0 && <li className="note">No requests are waiting.</li>}
      </ul>

      <h2 className="spaced">Recently decided</h2>
      <ul className="requests">
        {decided.map((r) => <Request key={r.id} r={r} canDecide={false} />)}
        {decided.length === 0 && <li className="note">Nothing decided yet.</li>}
      </ul>
    </section>
  );
}
