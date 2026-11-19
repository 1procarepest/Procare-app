'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, roleTitle, timeOffWhen } from '@/lib/labels';
import { todayYmd } from '@/lib/repcards';
import Face from '../../Face';

const plusDay = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dayName = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Approvers: put the person back to work on one day of their time off (today or later). */
function WorkDays({ r }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const today = todayYmd();
  const days = [];
  for (let d = r.start_date > today ? r.start_date : today; d <= r.end_date && days.length < 31; d = plusDay(d, 1)) days.push(d);
  if (!days.length) return null;
  const back = async (d) => {
    setBusy(true); setMsg('');
    const { data, error } = await createClient().rpc('time_off_work_day', { p_id: r.id, p_day: d });
    setBusy(false);
    if (error || !data) { setMsg(error ? `Couldn’t change it: ${error.message}` : 'Not allowed for your account.'); return; }
    router.refresh();
  };
  if (!open) return <button type="button" className="link" onClick={() => setOpen(true)}>Back to work on a day…</button>;
  return (
    <div className="workdays">
      <span className="note">Tap a day to put {r.employee?.first_name} back on the schedule that day:</span>
      <div className="chips">
        {days.map((d) => <button key={d} type="button" className="chip" disabled={busy} onClick={() => back(d)}>{dayName(d)}</button>)}
        <button type="button" className="link" onClick={() => setOpen(false)}>Done</button>
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
    </div>
  );
}

/** "Sent Nov 17, 3:42 PM · waiting 1 day" so approvers can see how long a request has waited. */
function sentLine(r) {
  if (!r.created_at) return '';
  const t = new Date(r.created_at);
  const when = t.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (r.status !== 'pending') return `Sent ${when}`;
  const hrs = Math.max(0, (Date.now() - t.getTime()) / 36e5);
  const wait = hrs < 1 ? 'less than an hour' : hrs < 24 ? `${Math.floor(hrs)} hour${Math.floor(hrs) === 1 ? '' : 's'}` : `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) === 1 ? '' : 's'}`;
  return `Sent ${when} · waiting ${wait}`;
}

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

function Request({ r, canDecide, canEdit }) {
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
          {r.kind && r.kind !== 'time_off' && <> <span className="badge badge-warn">{r.kind === 'sick' ? 'Sick' : 'Called out'}</span></>}
        </span>
        <span className={`sent-line${r.status === 'pending' && Date.now() - new Date(r.created_at).getTime() > 2 * 864e5 ? ' sent-old' : ''}`} suppressHydrationWarning>{sentLine(r)}</span>
        {r.note && <span className="note">“{r.note}”</span>}
        {r.decision_note && <span className="note">Reply: {r.decision_note}</span>}
      </div>
      <span className={`badge status-${r.status}`}>
        {r.status === 'approved' && e.department === 'sales' && r.decided_by === r.employee_id ? 'Notice' : STATUS[r.status]}
      </span>
      {canEdit && (r.status === 'approved' || r.status === 'pending') && <WorkDays r={r} />}
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
  const today = todayYmd();
  const upcoming = requests.filter((r) => r.status === 'approved' && r.end_date >= today && canApprove(me, r));
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
        {waiting.map((r) => <Request key={r.id} r={r} canDecide={canApprove(me, r)} canEdit={canApprove(me, r)} />)}
        {waiting.length === 0 && <li className="note">No requests are waiting.</li>}
      </ul>

      {upcoming.length > 0 && (
        <>
          <h2 className="spaced">Upcoming approved time off ({upcoming.length})</h2>
          <p className="note">Someone wants to work after all? Put them back on the schedule one day at a time.</p>
          <ul className="requests">
            {upcoming.map((r) => <Request key={r.id} r={r} canDecide={false} canEdit />)}
          </ul>
        </>
      )}

      <h2 className="spaced">Recently decided</h2>
      <ul className="requests">
        {decided.map((r) => <Request key={r.id} r={r} canDecide={false} />)}
        {decided.length === 0 && <li className="note">Nothing decided yet.</li>}
      </ul>
    </section>
  );
}
