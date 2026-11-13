'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ProfileActions({ employeeId, email }) {
  const [open, setOpen] = useState(null); // 'issue' | 'timeoff' | 'passcode' | null
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');

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

  async function changePasscode(event) {
    event.preventDefault();
    if (!/^\S{6,64}$/.test(next)) { setError('Passcodes are 6 to 64 letters, numbers or symbols, with no spaces.'); return; }
    if (next !== again) { setError('The new passcodes don’t match. Type it the same way both times.'); return; }
    if (next === current) { setError('Choose a passcode that’s different from your current one.'); return; }
    setBusy(true);
    setError('');
    const supabase = createClient();
    // Check the current passcode first, so nobody can change it from a device left signed in.
    const { error: wrong } = await supabase.auth.signInWithPassword({ email, password: current });
    if (wrong) { setBusy(false); setError('Your current passcode isn’t right. Check it and try again.'); return; }
    const { error: e } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setCurrent(''); setNext(''); setAgain('');
    setOpen(null);
    setDone('Passcode changed. Use the new one next time you sign in.');
  }

  return (
    <section className="actions" aria-label="Schedule actions">
      <button className="btn btn-quiet" type="button" onClick={() => show('issue')} aria-expanded={open === 'issue'}>
        Report a schedule issue
      </button>
      <button className="btn btn-quiet" type="button" onClick={() => show('timeoff')} aria-expanded={open === 'timeoff'}>
        Request time off
      </button>
      <button className="btn btn-quiet" type="button" onClick={() => show('passcode')} aria-expanded={open === 'passcode'}>
        Change passcode
      </button>

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

      {open === 'passcode' && (
        <form className="panel" onSubmit={changePasscode}>
          <div>
            <h3>Change passcode</h3>
            <p className="note">6 to 64 letters, numbers or symbols, with no spaces. Your lead or manager can still reset it if you forget it.</p>
          </div>
          <div>
            <label htmlFor="current-passcode">Current passcode</label>
            <input id="current-passcode" type="password" autoComplete="current-password" autoCapitalize="off" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="row">
            <div>
              <label htmlFor="new-passcode">New passcode</label>
              <input id="new-passcode" type="password" autoComplete="new-password" autoCapitalize="off" required minLength={6} maxLength={64} value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <label htmlFor="again-passcode">New passcode again</label>
              <input id="again-passcode" type="password" autoComplete="new-password" autoCapitalize="off" required minLength={6} maxLength={64} value={again} onChange={(e) => setAgain(e.target.value)} />
            </div>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change passcode'}</button>
            <button className="btn btn-quiet" type="button" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </form>
      )}

      {done && <p className="done" role="status">{done}</p>}
    </section>
  );
}
