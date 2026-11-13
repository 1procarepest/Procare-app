'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clock, fromMinutes } from '@/lib/labels';

// Times people can pick for part of a day: every 15 minutes, 5 AM to 10 PM
// Asks the server to send the automatic email for something just saved. Never blocks or
// shows errors: the save already worked, and the email is a bonus.
function notify(event, id) {
  if (!id) return;
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, id }),
    keepalive: true,
  }).catch(() => {});
}

const TIMES = Array.from({ length: (22 - 5) * 4 + 1 }, (_, i) => fromMinutes(5 * 60 + i * 15));

// Sales are 1099: they tell us their plans instead of asking. Same forms, different words,
// and the database confirms their time off right away (guard_time_off).
const WORDS = {
  staff: {
    issueButton: 'Report a schedule issue',
    issueLabel: 'What’s wrong with your schedule?',
    issueSend: 'Send report',
    issueDone: 'Schedule issue reported.',
    timeOffButton: 'Request time off',
    timeOffNote: 'A time-off request isn’t guaranteed until it’s approved.',
    timeOffSend: 'Send request',
    timeOffDone: 'Time off requested. It’s waiting for approval.',
  },
  sales: {
    issueButton: 'Update my schedule',
    issueLabel: 'What days and hours do you plan to work, and starting when?',
    issueSend: 'Send update',
    issueDone: 'Schedule update sent. Your schedule here changes once it’s entered.',
    timeOffButton: 'Notify of time off',
    timeOffNote: 'Let us know the days you’re taking off. They’re added to your schedule right away.',
    timeOffSend: 'Send notice',
    timeOffDone: 'Time off added to your schedule.',
  },
};

export default function ProfileActions({ employeeId, email, isSales = false }) {
  const w = isSales ? WORDS.sales : WORDS.staff;
  const router = useRouter();
  const [open, setOpen] = useState(null); // 'issue' | 'timeoff' | 'passcode' | null
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [partial, setPartial] = useState(false);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [usePto, setUsePto] = useState(false);
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
    const { data: saved, error: e } = await createClient()
      .from('schedule_issue_reports')
      .insert({ employee_id: employeeId, message: message.trim() })
      .select('id')
      .single();
    setBusy(false);
    if (e) { setError('The report didn’t save. Check your connection and try again.'); return; }
    notify('issue', saved?.id);
    setMessage('');
    setOpen(null);
    setDone(w.issueDone);
  }

  async function sendTimeOff(event) {
    event.preventDefault();
    const lastDay = partial ? start : end;
    if (lastDay < start) { setError('The last day off can’t be before the first day.'); return; }
    if (partial && !(fromTime < toTime)) { setError('The “to” time needs to be after the “from” time.'); return; }
    setBusy(true);
    setError('');
    const { data: saved, error: e } = await createClient()
      .from('time_off_requests')
      .insert({
        employee_id: employeeId,
        start_date: start,
        end_date: lastDay,
        start_time: partial ? fromTime : null,
        end_time: partial ? toTime : null,
        use_pto: !isSales && usePto,
        note: note.trim() || null,
      })
      .select('id')
      .single();
    setBusy(false);
    if (e) { setError('That didn’t save. Check your connection and try again.'); return; }
    notify('time_off', saved?.id);
    setStart(''); setEnd(''); setNote(''); setPartial(false); setFromTime(''); setToTime(''); setUsePto(false);
    setOpen(null);
    setDone(w.timeOffDone);
    if (isSales) router.refresh(); // show the time off on the schedule now
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
        {w.issueButton}
      </button>
      <button className="btn btn-quiet" type="button" onClick={() => show('timeoff')} aria-expanded={open === 'timeoff'}>
        {w.timeOffButton}
      </button>
      <button className="btn btn-quiet" type="button" onClick={() => show('passcode')} aria-expanded={open === 'passcode'}>
        Change passcode
      </button>

      {open === 'issue' && (
        <form className="panel" onSubmit={sendIssue}>
          <h3>{w.issueButton}</h3>
          <div>
            <label htmlFor="issue">{w.issueLabel}</label>
            <textarea id="issue" rows={4} required value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : w.issueSend}</button>
            <button className="btn btn-quiet" type="button" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </form>
      )}

      {open === 'timeoff' && (
        <form className="panel" onSubmit={sendTimeOff}>
          <div>
            <h3>{w.timeOffButton}</h3>
            <p className="note">{w.timeOffNote}</p>
          </div>
          <label className="toggle">
            <input type="checkbox" role="switch" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
            <span className="toggle-track" aria-hidden="true" />
            Part of a day
          </label>
          {partial ? (
            <>
              <div>
                <label htmlFor="start">Day</label>
                <input id="start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="row">
                <div>
                  <label htmlFor="from-time">Off from</label>
                  <select id="from-time" required value={fromTime} onChange={(e) => { setFromTime(e.target.value); if (toTime && toTime <= e.target.value) setToTime(''); }}>
                    <option value="" disabled>Choose a time</option>
                    {TIMES.slice(0, -1).map((t) => <option key={t} value={t}>{clock(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="to-time">Until</label>
                  <select id="to-time" required value={toTime} onChange={(e) => setToTime(e.target.value)}>
                    <option value="" disabled>Choose a time</option>
                    {TIMES.filter((t) => !fromTime || t > fromTime).map((t) => <option key={t} value={t}>{clock(t)}</option>)}
                  </select>
                </div>
              </div>
            </>
          ) : (
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
          )}
          {!isSales && (
            <label className="toggle">
              <input type="checkbox" role="switch" checked={usePto} onChange={(e) => setUsePto(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              Use paid time off (PTO)
            </label>
          )}
          <div>
            <label htmlFor="note">Note (optional)</label>
            <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : w.timeOffSend}</button>
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
