'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ProfileActions({ employeeId, canRequestTimeOff }) {
  const [open, setOpen] = useState(null); // 'issue' | 'timeoff' | null
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');

  function show(which) {
    setOpen(open === which ? null : which);
    setDone('');
    setError('');
  }

  async function sendIssue(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: e } = await createClient()
      .from('schedule_issue_reports')
      .insert({ employee_id: employeeId, message: message.trim() });
    setBusy(false);
    if (e) { setError('The report didn’t save. Check your connection and try again.'); return; }
    setMessage('');
    setOpen(null);
    setDone('Schedule issue reported.');
  }

  async function sendTimeOff(event) {
    event.preventDefault();
    if (end < start) { setError('The last day off can’t be before the first day.'); return; }
    setBusy(true);
    setError('');
    const { error: e } = await createClient()
      .from('time_off_requests')
      .insert({ employee_id: employeeId, start_date: start, end_date: end, note: note.trim() || null });
    setBusy(false);
    if (e) { setError('The request didn’t save. Check your connection and try again.'); return; }
    setStart(''); setEnd(''); setNote('');
    setOpen(null);
    setDone('Time off requested. It’s waiting for approval.');
  }

  return (
    <section className="actions" aria-label="Schedule actions">
      <button className="btn btn-quiet" type="button" onClick={() => show('issue')} aria-expanded={open === 'issue'}>
        Report a schedule issue
      </button>
      {canRequestTimeOff && (
        <button className="btn btn-quiet" type="button" onClick={() => show('timeoff')} aria-expanded={open === 'timeoff'}>
          Request time off
        </button>
      )}

      {open === 'issue' && (
        <form className="panel" onSubmit={sendIssue}>
          <h3>Report a schedule issue</h3>
          <div>
            <label htmlFor="issue">What’s wrong with your schedule?</label>
            <textarea id="issue" rows={4} required value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
            <button className="btn btn-quiet" type="button" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </form>
      )}

      {open === 'timeoff' && (
        <form className="panel" onSubmit={sendTimeOff}>
          <div>
            <h3>Request time off</h3>
            <p className="note">A time-off request isn’t guaranteed until it’s approved.</p>
          </div>
          <div className="row">
            <div>
              <label htmlFor="start">First day off</label>
              <input id="start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label htmlFor="end">Last day off</label>
              <input id="end" type="date" required min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="note">Note (optional)</label>
            <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
            <button className="btn btn-quiet" type="button" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </form>
      )}

      {done && <p className="done" role="status">{done}</p>}
    </section>
  );
}
