'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, roleTitle, shortDate } from '@/lib/labels';

const STATUS = { pending: 'Waiting', approved: 'Approved', denied: 'Denied', cancelled: 'Cancelled' };

function days(r) {
  const n = Math.round((new Date(`${r.end_date}T12:00:00`) - new Date(`${r.start_date}T12:00:00`)) / 864e5) + 1;
  return `${n} day${n === 1 ? '' : 's'}`;
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
    const { error: err } = await createClient()
      .from('time_off_requests')
      .update({ status, decision_note: note.trim() || null })
      .eq('id', r.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  return (
    <li className="request">
      <div className="request-main">
        <span className="person-name">{e.first_name} {e.last_name}</span>
        <span className="person-role">{roleTitle(e.department, e.level)}, {OFFICE_NAME[e.office] || 'No office'}</span>
        <span>
          {shortDate(r.start_date)}{r.end_date !== r.start_date ? ` to ${shortDate(r.end_date)}` : ''} ({days(r)})
        </span>
        {r.note && <span className="note">“{r.note}”</span>}
        {r.decision_note && <span className="note">Reply: {r.decision_note}</span>}
      </div>
      <span className={`badge status-${r.status}`}>{STATUS[r.status]}</span>
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

export default function TimeOffList({ requests, isApprover, myId, isPresident }) {
  const waiting = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending')
    .sort((a, b) => String(b.decided_at || b.created_at).localeCompare(String(a.decided_at || a.created_at)))
    .slice(0, 40);
  const canDecide = (r) => isApprover && (isPresident || r.employee_id !== myId);

  return (
    <section className="section">
      <div className="admin-head">
        <h1>Time off</h1>
        <p className="note">
          {isApprover ? 'You give final approval on these requests.' : 'Requests from your team. Final approval is given by HR.'}
        </p>
      </div>

      <h2>Waiting for a decision ({waiting.length})</h2>
      <ul className="requests">
        {waiting.map((r) => <Request key={r.id} r={r} canDecide={canDecide(r)} />)}
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
