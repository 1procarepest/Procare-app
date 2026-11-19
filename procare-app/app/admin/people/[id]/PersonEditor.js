'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DAY_NAMES, DEPT_LABEL, LEVEL_LABEL, OFFICES, WEEK_ORDER, levelOptions, roleTitle, timeOffWhen } from '@/lib/labels';
import Face from '../../../Face';
import Toggle from '../../../Toggle';
import { isBWeek, mondayOf } from '@/lib/schedules';
import { FORM_DAYS, dayLine, slotHours } from '@/lib/availability';
import { BugTile } from '../../../Bug';

function trimTime(t) { return t ? String(t).slice(0, 5) : ''; }

const TIME_OFF_BADGE = { approved: 'Approved', pending: 'Requested' };

export default function PersonEditor({ person, schedule, altSchedule = [], forms = [], aWeek = null, today, upcoming = [], me, canManage, canEditSchedule }) {
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
    setStatusMsg({ text: on ? `${person.first_name} is reactivated.` : `${person.first_name} is deactivated.`, bad: false });
    router.refresh();
  }

  // ----- Schedule -----
  const initial = {};
  WEEK_ORDER.forEach((d) => { initial[d] = { on: false, start: '09:00', end: '18:00' }; });
  schedule.forEach((s) => {
    if (s.start_time && s.end_time) initial[s.weekday] = { on: true, start: trimTime(s.start_time), end: trimTime(s.end_time) };
  });
  const [days, setDays] = useState(initial);

  // Every other week (change 54): week A is the schedule above; week B changes only the days marked different.
  const thisMonday = mondayOf(today || new Date().toISOString().slice(0, 10));
  const lastMonday = (() => { const d = new Date(`${thisMonday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();
  const [alternates, setAlternates] = useState(!!aWeek);
  const [thisWeekIsA, setThisWeekIsA] = useState(aWeek ? !isBWeek(aWeek, thisMonday) : true);
  const altInitial = {};
  WEEK_ORDER.forEach((d) => { altInitial[d] = { differ: false, on: false, start: '08:30', end: '17:00' }; });
  altSchedule.forEach((s) => {
    altInitial[s.weekday] = s.start_time && s.end_time
      ? { differ: true, on: true, start: trimTime(s.start_time), end: trimTime(s.end_time) }
      : { ...altInitial[s.weekday], differ: true, on: false };
  });
  const [altDays, setAltDays] = useState(altInitial);
  function setAltDay(d, patch) { setAltDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } })); }

  // Fill the weekly schedule from an availability form (Mon–Sat; Sunday stays as it is). Saved with "Save schedule".
  const [usedForm, setUsedForm] = useState(null);
  function fillFromForm(f) {
    const nextDays = { ...days };
    const nextAlt = { ...altDays };
    let anyAlt = false;
    FORM_DAYS.forEach((d) => {
      const a = slotHours(f.days?.[d]?.a);
      nextDays[d] = a ? { on: true, start: a.s, end: a.e } : { ...nextDays[d], on: false };
      const bSlot = f.days?.[d]?.b;
      if (bSlot) {
        anyAlt = true;
        const b = slotHours(bSlot);
        nextAlt[d] = b ? { differ: true, on: true, start: b.s, end: b.e } : { ...nextAlt[d], differ: true, on: false };
      } else nextAlt[d] = { ...nextAlt[d], differ: false };
    });
    setDays(nextDays);
    setAltDays(nextAlt);
    if (anyAlt) {
      setAlternates(true);
      // The form's first choice was the week it was sent: that week is week A
      setThisWeekIsA(!isBWeek(mondayOf(String(f.submitted_at).slice(0, 10)), thisMonday));
    }
    setUsedForm(f.id);
    setScheduleMsg({ text: 'Filled in from the form. Check the hours below, then click Save schedule.', bad: false });
  }
  const [scheduleMsg, setScheduleMsg] = useState({ text: '', bad: false });
  const [savingSchedule, setSavingSchedule] = useState(false);

  function setDay(d, patch) { setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } })); }

  async function saveSchedule(e) {
    e.preventDefault();
    const bad = WEEK_ORDER.find((d) => days[d].on && days[d].start >= days[d].end);
    if (bad !== undefined) { setScheduleMsg({ text: `${DAY_NAMES[bad]}: the end time has to be after the start time.`, bad: true }); return; }
    const badB = alternates && WEEK_ORDER.find((d) => altDays[d].differ && altDays[d].on && altDays[d].start >= altDays[d].end);
    if (alternates && badB !== undefined) { setScheduleMsg({ text: `Week B ${DAY_NAMES[badB]}: the end time has to be after the start time.`, bad: true }); return; }
    setSavingSchedule(true);
    setScheduleMsg({ text: '', bad: false });
    const supabase = createClient();
    const working = WEEK_ORDER.filter((d) => days[d].on)
      .map((d) => ({ employee_id: person.id, weekday: d, start_time: days[d].start, end_time: days[d].end }));
    const off = WEEK_ORDER.filter((d) => !days[d].on);
    let error = null;
    if (working.length) ({ error } = await supabase.from('schedules').upsert(working, { onConflict: 'employee_id,weekday' }));
    if (!error && off.length) ({ error } = await supabase.from('schedules').delete().eq('employee_id', person.id).in('weekday', off));
    // Every other week: replace the week-B days and which week is A, or clear them
    const bRows = alternates ? WEEK_ORDER.filter((d) => altDays[d].differ)
      .map((d) => ({ employee_id: person.id, weekday: d, start_time: altDays[d].on ? altDays[d].start : null, end_time: altDays[d].on ? altDays[d].end : null })) : [];
    if (!error) ({ error } = await supabase.from('schedule_alt').delete().eq('employee_id', person.id));
    if (!error && bRows.length) ({ error } = await supabase.from('schedule_alt').insert(bRows));
    if (!error) {
      ({ error } = alternates && bRows.length
        ? await supabase.from('schedule_rotations').upsert({ employee_id: person.id, a_week: thisWeekIsA ? thisMonday : lastMonday, updated_at: new Date().toISOString() })
        : await supabase.from('schedule_rotations').delete().eq('employee_id', person.id));
    }
    setSavingSchedule(false);
    if (error) { setScheduleMsg({ text: error.message, bad: true }); return; }
    if (usedForm) {
      await supabase.from('availability_forms').update({ applied_at: new Date().toISOString(), applied_by: me.id }).eq('id', usedForm);
      setUsedForm(null);
    }
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
        <div className="with-face big"><Face person={person} size={64} /><h1>{person.first_name} {person.last_name}</h1></div>
        <p className="note">{roleTitle(person.department, person.level)}</p>
        <p className="login-line">
          <span className="login-label">Login email</span>
          {person.email
            ? <><span className="login-email">{person.email}</span>{person.auth_user_id ? <span className="pill pill-good">Has a login</span> : <span className="pill">No login yet</span>}</>
            : <span className="note">Not available</span>}
        </p>
        {person.phone && <p className="note">Phone {person.phone}</p>}
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
                    {timeOffWhen(r)}{r.use_pto ? ', paid vacation' : ''}
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
          <Toggle checked={hr} onChange={setHr} disabled={!canManage}>Gives final approval on time off</Toggle>
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
          <h2>{person.active ? 'Deactivate team member' : 'Deactivated'}</h2>
          <p className="note">
            {person.active
              ? `Deactivating ${person.first_name} takes them out of lists, schedules and performance cards and stops their sign-in. Their history stays, you can reactivate them any time, and FieldRoutes won’t turn them back on.`
              : `${person.first_name} is deactivated${person.deactivated_by === 'sync' ? ' because they’re inactive in FieldRoutes. They come back on their own if FieldRoutes turns them back on' : ''}: they can’t sign in and don’t show up in lists, schedules or performance cards. Their history is kept.`}
          </p>
          {statusMsg.text && <p className={statusMsg.bad ? 'error' : 'ok'} role="status">{statusMsg.text}</p>}
          <div className="panel-buttons">
            {person.active && !confirmOff && (
              <button className="btn btn-quiet" type="button" onClick={() => setConfirmOff(true)}>Deactivate {person.first_name}</button>
            )}
            {person.active && confirmOff && (
              <>
                <button className="btn btn-danger" type="button" disabled={savingStatus} onClick={() => setActiveStatus(false)}>
                  {savingStatus ? 'Deactivating…' : `Yes, deactivate ${person.first_name} ${person.last_name}`}
                </button>
                <button className="btn btn-quiet" type="button" onClick={() => setConfirmOff(false)}>Cancel</button>
              </>
            )}
            {!person.active && (
              <button className="btn" type="button" disabled={savingStatus} onClick={() => setActiveStatus(true)}>
                {savingStatus ? 'Reactivating…' : `Reactivate ${person.first_name}`}
              </button>
            )}
          </div>
        </section>
      )}

      {forms.length > 0 && (
        <section className="panel av-file">
          <h2><BugTile kind="cricket" tone="lime" size={30} /> {person.department === 'sales' ? 'Contractor availability form' : 'Availability form'}</h2>
          {(() => {
            const f = forms[0];
            const when = new Date(f.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
            return (
              <>
                <p className="note">Filled out {when}, signed “{f.signature}”{f.location ? ` · ${f.location}` : ''}{f.position ? ` · ${f.position}` : ''}.
                  {f.applied_at ? (person.department === 'sales' ? ' Their schedule updated from it automatically.' : ' Approved and entered in the schedule.') : ' Waiting for approval: not entered in the schedule yet.'}</p>
                <ul>{FORM_DAYS.map((d) => <li key={d}>{dayLine(f.days, d)}</li>)}</ul>
                {f.notes && <p className="note">“{f.notes}”</p>}
                {canEditSchedule && <div className="panel-buttons"><button type="button" className="btn btn-small" onClick={() => fillFromForm(f)}>{f.applied_at ? 'Fill in from this form again' : 'Fill in from this form'}</button></div>}
                {forms.length > 1 && <p className="note">{forms.length - 1} earlier form{forms.length > 2 ? 's' : ''} on file.</p>}
              </>
            );
          })()}
        </section>
      )}

      <form className="panel" onSubmit={saveSchedule}>
        <h2>Weekly schedule</h2>
        {!canEditSchedule && <p className="note">Only this person’s manager can change their schedule.</p>}
        <ul className="sched">
          {WEEK_ORDER.map((d) => (
            <li key={d} className="sched-row">
              <Toggle small className="sched-day" checked={days[d].on} disabled={!canEditSchedule} onChange={(v) => setDay(d, { on: v })}>
                {DAY_NAMES[d]}
              </Toggle>
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

        <div className="sched-alt">
          <Toggle checked={alternates} disabled={!canEditSchedule} onChange={setAlternates}>Every other week is different</Toggle>
          {alternates && (
            <>
              <p className="note">The days above are <b>week A</b>. Mark only the days that are different on <b>week B</b>, like every other Saturday or swapping two days.</p>
              <div className="sched-ab" role="group" aria-label="This week">
                <span>This week (from {thisMonday.slice(5).replace('-', '/')}) is</span>
                <button type="button" className={`chip${thisWeekIsA ? ' on' : ''}`} disabled={!canEditSchedule} onClick={() => setThisWeekIsA(true)}>Week A</button>
                <button type="button" className={`chip${!thisWeekIsA ? ' on' : ''}`} disabled={!canEditSchedule} onClick={() => setThisWeekIsA(false)}>Week B</button>
              </div>
              <ul className="sched">
                {WEEK_ORDER.map((d) => (
                  <li key={d} className="sched-row">
                    <Toggle small className="sched-day" checked={altDays[d].differ} disabled={!canEditSchedule} onChange={(v) => setAltDay(d, { differ: v })}>
                      {DAY_NAMES[d]}
                    </Toggle>
                    {!altDays[d].differ ? <span className="note">Same as week A</span> : (
                      <span className="sched-times">
                        <Toggle small checked={altDays[d].on} disabled={!canEditSchedule} onChange={(v) => setAltDay(d, { on: v })}>{altDays[d].on ? 'Works' : 'Off'}</Toggle>
                        {altDays[d].on && (
                          <>
                            <input type="time" aria-label={`Week B ${DAY_NAMES[d]} start`} value={altDays[d].start} disabled={!canEditSchedule} onChange={(e) => setAltDay(d, { start: e.target.value })} />
                            <span aria-hidden="true">to</span>
                            <input type="time" aria-label={`Week B ${DAY_NAMES[d]} end`} value={altDays[d].end} disabled={!canEditSchedule} onChange={(e) => setAltDay(d, { end: e.target.value })} />
                          </>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {scheduleMsg.text && <p className={scheduleMsg.bad ? 'error' : 'ok'} role="status">{scheduleMsg.text}</p>}
        {canEditSchedule && (
          <div className="panel-buttons">
            <button className="btn" type="submit" disabled={savingSchedule}>{savingSchedule ? 'Saving…' : 'Save schedule'}</button>
          </div>
        )}
      </form>

      {canManage && me.rank < 3 && (
        <section className="panel">
          <h2>Login</h2>
          <p className="note">{person.auth_user_id ? 'Has a login.' : 'No login yet.'} Passcodes are set by the department manager. {person.first_name} can change their own from their profile.</p>
        </section>
      )}

      {canManage && me.rank >= 3 && (
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
          {!person.active && <p className="note">Reactivate this person before giving them a login.</p>}
        </form>
      )}
    </div>
  );
}
