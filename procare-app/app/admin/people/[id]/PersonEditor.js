'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DAY_NAMES, DEPT_LABEL, LEVEL_LABEL, OFFICES, WEEK_ORDER, levelOptions, roleTitle, timeOffWhen } from '@/lib/labels';

function trimTime(t) { return t ? String(t).slice(0, 5) : ''; }

const TIME_OFF_BADGE = { approved: 'Approved', pending: 'Requested' };

export default function PersonEditor({ person, schedule, upcoming = [], me, canManage, canEditSchedule }) {
  const router = useRouter();
  const isSelf = person.id === me.id;

  // ----- Details -----
  const [level, setLevel] = useState(person.level);
  const [office, setOffice] = useState(person.office || '');
  const [confirmOff, setConfirmOff] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', bad: false });
  const [savingStatus, setSavingStatus] = useState(false);
  const [hr, setHr] = useState(person.hr_approver);
  const [detailsMsg, setDetailsMsg] = useState({ text: '', bad: false });
  const [savingDetails, setSavingDetails] = useState(false);

  let options = levelOptions(me.level);
  if (!options.includes(person.level)) options = [...options, person.level];
  const officeLocked = me.level === 'lead';

  async function saveDetails(e) {
    e.preventDefault();
    setSavingDetails(true);
    setDetailsMsg({ text: '', bad: false });
    const changes = { level, office: office || null };
    if (me.rank >= 4) changes.hr_approver = hr;
    const { error } = await createClient().from('employees').update(changes).eq('id', person.id);
    setSavingDetails(false);
    if (error) { setDetailsMsg({ text: error.message, bad: true }); return; }
    setDetailsMsg({ text: 'Changes saved.', bad: false });
    router.refresh();
  }

  async function setActiveStatus(on) {
    setSavingStatus(true);
    setStatusMsg({ text: '', bad: false });
    const { error } = await createClient().from('employees').update({ active: on }).eq('id', person.id);
    setSavingStatus(false);
    setConfirmOff(false);
    if (error) { setStatusMsg({ text: error.message, bad: true }); return; }
    setStatusMsg({ text: on ? `${person.first_name} is switched back on.` : `${person.first_name} is switched off.`, bad: false });
    router.refresh();
  }

  // ----- Schedule -----
  const initial = {};
  WEEK_ORDER.forEach((d) => { initial[d] = { on: false, start: '09:00', end: '18:00' }; });
  schedule.forEach((s) => {
    if (s.start_time && s.end_time) initial[s.weekday] = { on: true, start: trimTime(s.start_time), end: trimTime(s.end_time) };
  });
  const [days, setDays] = useState(initial);
  const [scheduleMsg, setScheduleMsg] = useState({ text: '', bad: false });
  const [savingSchedule, setSavingSchedule] = useState(false);

  function setDay(d, patch) { setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } })); }

  async function saveSchedule(e) {
    e.preventDefault();
    const bad = WEEK_ORDER.find((d) => days[d].on && days[d].start >= days[d].end);
    if (bad !== undefined) { setScheduleMsg({ text: `${DAY_NAMES[bad]}: the end time has to be after the start time.`, bad: true }); return; }
    setSavingSchedule(true);
    setScheduleMsg({ text: '', bad: false });
    const supabase = createClient();
    const working = WEEK_ORDER.filter((d) => days[d].on)
      .map((d) => ({ employee_id: person.id, weekday: d, start_time: days[d].start, end_time: days[d].end }));
    const off = WEEK_ORDER.filter((d) => !days[d].on);
    let error = null;
    if (working.length) ({ error } = await supabase.from('schedules').upsert(working, { onConflict: 'employee_id,weekday' }));
    if (!error && off.length) ({ error } = await supabase.from('schedules').delete().eq('employee_id', person.id).in('weekday', off));
    setSavingSchedule(false);
    if (error) { setScheduleMsg({ text: error.message, bad: true }); return; }
    setScheduleMsg({ text: 'Schedule saved.', bad: false });
    router.refresh();
  }

  // ----- Login -----
  const [passcode, setPasscode] = useState('');
  const [loginMsg, setLoginMsg] = useState({ text: '', bad: false });
  const [savingLogin, setSavingLogin] = useState(false);

  async function saveLogin(e) {
    e.preventDefault();
    setSavingLogin(true);
    setLoginMsg({ text: '', bad: false });
    const res = await fetch('/api/passcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: person.id, passcode }),
    });
    const body = await res.json().catch(() => ({}));
    setSavingLogin(false);
    if (!res.ok) { setLoginMsg({ text: body.message || 'That didn’t work. Try again.', bad: true }); return; }
    setPasscode('');
    setLoginMsg({ text: `${body.message} Give ${person.first_name} the passcode in person or by text.`, bad: false });
    router.refresh();
  }

  return (
    <div className="editor">
      <div className="admin-head">
        <h1>{person.first_name} {person.last_name}</h1>
        <p className="note">
          {roleTitle(person.department, person.level)}. {person.email}{person.phone ? `, ${person.phone}` : ''}
        </p>
        {!canManage && !isSelf && <p className="note">You can view this person, but changes are made by their manager.</p>}
      </div>

      <section className="panel" aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading">Upcoming time off</h2>
        {upcoming.length === 0 ? (
          <p className="note">No approved or requested time off coming up.</p>
        ) : (
          <ul className="requests">
            {upcoming.map((r) => (
              <li key={r.id} className="request">
                <div className="request-main">
                  <span className="person-name">
                    {timeOffWhen(r)}{r.use_pto ? ', PTO' : ''}
                  </span>
                  {r.note && <span className="note">{r.note}</span>}
                </div>
                <span className={`badge status-${r.status}`}>{TIME_OFF_BADGE[r.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className="panel" onSubmit={saveDetails}>
        <h2>Role and office</h2>
        <p className="note">Department comes from FieldRoutes: {DEPT_LABEL[person.department]}.</p>
        <div className="row">
          <div>
            <label htmlFor="level">Level</label>
            <select id="level" value={level} onChange={(e) => setLevel(e.target.value)} disabled={!canManage}>
              {options.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="office">Office</label>
            <select id="office" value={office} onChange={(e) => setOffice(e.target.value)} disabled={!canManage || officeLocked}>
              <option value="">No office</option>
              {OFFICES.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
            </select>
          </div>
        </div>
        {me.rank >= 4 && (
          <label className="check">
            <input type="checkbox" checked={hr} onChange={(e) => setHr(e.target.checked)} disabled={!canManage} />
            Gives final approval on time off
          </label>
        )}
        {detailsMsg.text && <p className={detailsMsg.bad ? 'error' : 'ok'} role="status">{detailsMsg.text}</p>}
        {canManage && (
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={savingDetails}>{savingDetails ? 'Saving…' : 'Save changes'}</button>
          </div>
        )}
      </form>

      {canManage && (
        <section className="panel">
          <h2>{person.active ? 'Left Procare?' : 'Switched off'}</h2>
          <p className="note">
            {person.active
              ? `Switching ${person.first_name} off takes them out of lists, schedules and scorecards and stops their sign-in. Their history stays, and you can switch them back on any time.`
              : `${person.first_name} can’t sign in and doesn’t show up in lists, schedules or scorecards. Their history is kept.`}
          </p>
          {statusMsg.text && <p className={statusMsg.bad ? 'error' : 'ok'} role="status">{statusMsg.text}</p>}
          <div className="panel-buttons">
            {person.active && !confirmOff && (
              <button className="btn btn-quiet" type="button" onClick={() => setConfirmOff(true)}>Switch off {person.first_name}</button>
            )}
            {person.active && confirmOff && (
              <>
                <button className="btn btn-danger" type="button" disabled={savingStatus} onClick={() => setActiveStatus(false)}>
                  {savingStatus ? 'Switching off…' : `Yes, switch off ${person.first_name} ${person.last_name}`}
                </button>
                <button className="btn btn-quiet" type="button" onClick={() => setConfirmOff(false)}>Cancel</button>
              </>
            )}
            {!person.active && (
              <button className="btn" type="button" disabled={savingStatus} onClick={() => setActiveStatus(true)}>
                {savingStatus ? 'Switching on…' : `Switch ${person.first_name} back on`}
              </button>
            )}
          </div>
        </section>
      )}

      <form className="panel" onSubmit={saveSchedule}>
        <h2>Weekly schedule</h2>
        {!canEditSchedule && <p className="note">Only this person’s manager can change their schedule.</p>}
        <ul className="sched">
          {WEEK_ORDER.map((d) => (
            <li key={d} className="sched-row">
              <label className="check sched-day">
                <input type="checkbox" checked={days[d].on} disabled={!canEditSchedule} onChange={(e) => setDay(d, { on: e.target.checked })} />
                {DAY_NAMES[d]}
              </label>
              {days[d].on ? (
                <span className="sched-times">
                  <input type="time" aria-label={`${DAY_NAMES[d]} start`} value={days[d].start} disabled={!canEditSchedule} onChange={(e) => setDay(d, { start: e.target.value })} />
                  <span aria-hidden="true">to</span>
                  <input type="time" aria-label={`${DAY_NAMES[d]} end`} value={days[d].end} disabled={!canEditSchedule} onChange={(e) => setDay(d, { end: e.target.value })} />
                </span>
              ) : <span className="note">Off</span>}
            </li>
          ))}
        </ul>
        {scheduleMsg.text && <p className={scheduleMsg.bad ? 'error' : 'ok'} role="status">{scheduleMsg.text}</p>}
        {canEditSchedule && (
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={savingSchedule}>{savingSchedule ? 'Saving…' : 'Save schedule'}</button>
          </div>
        )}
      </form>

      {canManage && (
        <form className="panel" onSubmit={saveLogin}>
          <h2>{person.auth_user_id ? 'Reset passcode' : 'Create login'}</h2>
          <p className="note">
            {person.auth_user_id
              ? `Sets a new passcode for ${person.email}. The old one stops working right away.`
              : `${person.first_name} signs in with ${person.email} and the passcode you choose here.`}
          </p>
          <div>
            <label htmlFor="passcode">New passcode (6 to 64 letters, numbers or symbols)</label>
            <input id="passcode" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} minLength={6} maxLength={64} pattern="\S{6,64}" title="6 to 64 letters, numbers or symbols, with no spaces" required value={passcode} onChange={(e) => setPasscode(e.target.value.replace(/\s/g, ''))} />
          </div>
          {loginMsg.text && <p className={loginMsg.bad ? 'error' : 'ok'} role="status">{loginMsg.text}</p>}
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={savingLogin || !person.active}>
              {savingLogin ? 'Saving…' : person.auth_user_id ? 'Reset passcode' : 'Create login'}
            </button>
          </div>
          {!person.active && <p className="note">Switch this person on before giving them a login.</p>}
        </form>
      )}
    </div>
  );
}
