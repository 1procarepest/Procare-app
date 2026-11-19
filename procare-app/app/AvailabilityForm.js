'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, clock, fromMinutes, roleTitle } from '@/lib/labels';
import { DAY_FULL, FORM_DAYS } from '@/lib/availability';
import Bug, { BugTile } from './Bug';
import Toggle from './Toggle';

// Every 15 minutes, 6 AM to 9 PM
const TIMES = Array.from({ length: (21 - 6) * 4 + 1 }, (_, i) => fromMinutes(6 * 60 + i * 15));
const KINDS = [['all', 'All day'], ['hours', 'Set hours'], ['off', 'Not available']];
const DAY_BUG = { 1: 'ant', 2: 'spider', 3: 'cricket', 4: 'roach', 5: 'termite', 6: 'stinging' };
const LOCATIONS = [['west', 'West'], ['east', 'East'], ['south', 'South'], ['admin', 'Admin']];
const blank = () => ({ kind: 'all', s: '09:00', e: '17:00' });

/** One choice for a day (or for its every-other-week version): All day / Set hours / Not available. */
function Slot({ value, onChange, label }) {
  return (
    <div className="av-slot">
      <div className="av-kinds" role="radiogroup" aria-label={label}>
        {KINDS.map(([k, text]) => (
          <button key={k} type="button" role="radio" aria-checked={value.kind === k} className={`av-kind${value.kind === k ? ' on' : ''}`}
            onClick={() => onChange({ ...value, kind: k })}>{text}</button>
        ))}
      </div>
      {value.kind === 'hours' && (
        <div className="av-hours">
          <select aria-label={`${label} from`} value={value.s} onChange={(e) => onChange({ ...value, s: e.target.value })}>
            {TIMES.map((t) => <option key={t} value={t}>{clock(t)}</option>)}
          </select>
          <span aria-hidden="true">to</span>
          <select aria-label={`${label} to`} value={value.e} onChange={(e) => onChange({ ...value, e: e.target.value })}>
            {TIMES.map((t) => <option key={t} value={t}>{clock(t)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

/**
 * The Employee Availability Form, in the app. Saves to the person's file (availability_forms) and emails Ally.
 * person: { first_name, last_name, office, department, level }
 */
export default function AvailabilityForm({ employeeId, person, onSent, onCancel }) {
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  const [location, setLocation] = useState(person.department === 'administrative' ? 'admin' : (person.office || 'west'));
  const [position, setPosition] = useState(roleTitle(person.department, person.level));
  const [days, setDays] = useState(() => Object.fromEntries(FORM_DAYS.map((d) => [d, { a: blank(), alt: false, b: { ...blank(), kind: 'off' } }])));
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setDay = (d, patch) => setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } }));

  async function submit(e) {
    e.preventDefault();
    for (const d of FORM_DAYS) {
      for (const [x, which] of [[days[d].a, ''], ...(days[d].alt ? [[days[d].b, ' (every other week)']] : [])]) {
        if (x.kind === 'hours' && !(x.s < x.e)) { setError(`${DAY_FULL[d]}${which}: the end time has to be after the start time.`); return; }
      }
    }
    if (signature.trim().length < 2) { setError('Type your full name to sign the form.'); return; }
    const clean = (x) => (x.kind === 'hours' ? { kind: 'hours', s: x.s, e: x.e } : { kind: x.kind });
    const payload = Object.fromEntries(FORM_DAYS.map((d) => [d, { a: clean(days[d].a), b: days[d].alt ? clean(days[d].b) : null }]));
    setBusy(true);
    setError('');
    const { data: saved, error: err } = await createClient().from('availability_forms').insert({
      employee_id: employeeId, location: LOCATIONS.find(([k]) => k === location)?.[1] || location, position: position.trim() || null,
      days: payload, notes: notes.trim() || null, signature: signature.trim(),
    }).select('id').single();
    setBusy(false);
    if (err) { setError('The form didn’t save. Check your connection and try again.'); return; }
    onSent?.(saved.id);
  }

  return (
    <form className="av-form" onSubmit={submit}>
      <div className="brand-head brand-hero av-head">
        <Bug kind="termite" size={150} className="brand-head-bug" />
        <p className="rc-kicker">Employee availability form · {new Date().getFullYear()}</p>
        <h3 className="rc-title">When can you <em>work?</em></h3>
        <p className="av-who">{person.first_name} {person.last_name} · {OFFICE_NAME[person.office] || 'No office'}</p>
      </div>

      <div className="av-row">
        <label className="calc-field">Location
          <select value={location} onChange={(e) => setLocation(e.target.value)}>
            {LOCATIONS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label className="calc-field av-grow">Position
          <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Tech, Flier Rep, Admin…" maxLength={80} />
        </label>
      </div>

      <div className="av-how">
        <BugTile kind="ant" tone="lime" size={34} />
        <ul>
          <li><b>All day</b> means you can work the company hours that day.</li>
          <li><b>Set hours</b> when you can only work part of the day.</li>
          <li><b>Not available</b> when you can’t work that day.</li>
          <li>Different every other week? Switch on <b>Every other week</b> for that day.</li>
        </ul>
      </div>

      <ul className="av-days">
        {FORM_DAYS.map((d) => (
          <li key={d} className="av-day">
            <div className="av-day-head">
              <BugTile kind={DAY_BUG[d]} tone={days[d].a.kind === 'off' ? 'sage' : 'forest'} size={30} />
              <b>{DAY_FULL[d]}</b>
            </div>
            <Slot label={DAY_FULL[d]} value={days[d].a} onChange={(a) => setDay(d, { a })} />
            <Toggle small checked={days[d].alt} onChange={(v) => setDay(d, { alt: v })}>Every other week</Toggle>
            {days[d].alt && (
              <div className="av-alt">
                <span className="rc-label">The other week</span>
                <Slot label={`${DAY_FULL[d]}, the other week`} value={days[d].b} onChange={(b) => setDay(d, { b })} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <label className="calc-field">Anything else? (optional)
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Starting date, school schedule, a second job…" maxLength={600} />
      </label>

      <p className="note av-note">This is used to build your schedule. If your availability changes, let your manager know right away and fill out a new form. It’s kept in your employee file.</p>

      <div className="av-row av-sign">
        <label className="calc-field av-grow">Signature: type your full name
          <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={`${person.first_name} ${person.last_name}`} autoComplete="name" required />
        </label>
        <span className="av-date"><span className="rc-label">Date</span>{today}</span>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="panel-buttons">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send to Ally'}</button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
