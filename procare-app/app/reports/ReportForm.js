'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import {
  CLEAN, COMMS, EXPERIENCE, FB_AUTOPAY, FB_UPSELL, IMPRESSION, IMPROVE_HINT, INTERIOR, KIND_LABEL, LIGHTS, PRAISE_HINT, RIDE_SERVICE,
  RIDE_UPSELL, SKILLS, TERMITE, WEBS, YES_NO, missing, truckItems,
} from '@/lib/reports';
import { clearDraft, enqueue, loadDraft, saveDraft, sendReport } from '@/lib/outbox';
import Toggle from '../Toggle';
import Picker from '../Picker';
import { BugTile } from '../Bug';

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));

const blank = (kind, today) => ({ id: newId(), kind, day: today, tech_id: '', answers: {}, improve: [], tech_praise: '', tech_note: '', told_tech: false });

/** Buttons for one answer (Yes / No …). */
function Choice({ options, value, onChange, label }) {
  return (
    <div className="rf-choice" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={String(value) === String(o.v)}
          className={`cp-chip${String(value) === String(o.v) ? ' on' : ''}`} onClick={() => onChange(String(value) === String(o.v) ? undefined : o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

/** A guided 1-5 rating: each level spelled out so every manager scores the same way. */
function Scale({ options, value, onChange, label }) {
  return (
    <div className="rf-scale" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={Number(value) === o.v}
          className={`rf-level${Number(value) === o.v ? ' on' : ''}`} onClick={() => onChange(Number(value) === o.v ? undefined : o.v)}>
          <span className="rf-level-n">{o.v}</span>
          <span className="rf-level-text">
            <b>{o.emoji ? `${o.emoji} ` : ''}{o.label}</b>
            <small>{o.hint}{o.aside ? <><br /><i>{o.aside}</i></> : null}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function Q({ title, children, hint }) {
  return (
    <div className="rf-q">
      <p className="rf-q-title">{title}</p>
      {hint && <p className="calc-hint">{hint}</p>}
      {children}
    </div>
  );
}

/** A numbered section with a bug, in the brand's mono-caps label style. */
function Step({ n, bug, tone = 'sage', title, kicker, className = '', children }) {
  return (
    <section className={`rf-card ${className}`.trim()}>
      <div className="rf-step">
        <BugTile kind={bug} tone={tone} size={38} />
        <div><p className="rf-kicker">{kicker || `Step ${n}`}</p><h2>{title}</h2></div>
      </div>
      <div className="rf-sec">{children}</div>
    </section>
  );
}

export default function ReportForm({ kind, techs, today, myOffice }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [f, setF] = useState(() => blank(kind, today));
  const [ready, setReady] = useState(false);
  const [stops, setStops] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [problems, setProblems] = useState([]);

  // Pick up a draft left on this phone
  useEffect(() => {
    const d = loadDraft(kind);
    if (d && d.kind === kind) setF({ ...blank(kind, today), ...d });
    setReady(true);
  }, [kind, today]);
  useEffect(() => { if (ready) saveDraft(kind, f); }, [ready, kind, f]);

  // Follow-behinds: the chosen tech's stops in the last 7 days
  useEffect(() => {
    if (kind !== 'follow_behind' || !f.tech_id) { setStops(null); return undefined; }
    let live = true;
    setStops(null);
    sb.rpc('recent_stops', { p_tech: f.tech_id }).then(({ data, error }) => {
      if (live) setStops(error ? { error: error.message } : data || []);
    });
    return () => { live = false; };
  }, [sb, kind, f.tech_id]);

  const a = f.answers;
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const ans = (patch) => setF((x) => ({ ...x, answers: { ...x.answers, ...patch } }));
  const tech = techs.find((t) => t.id === f.tech_id);
  const name = tech ? tech.first_name : 'the tech';

  const techOptions = useMemo(() => [...techs]
    .sort((x, y) => (x.office === myOffice ? -1 : 0) - (y.office === myOffice ? -1 : 0) || String(x.office).localeCompare(String(y.office)))
    .map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}`, group: OFFICE_NAME[t.office] || 'No office' })), [techs, myOffice]);

  const pickStop = (s) => set({
    appointment_id: s.appointment_id, customer_id: s.customer_id, day: s.day, termite: !!s.termite, typed: false,
    customer: [s.customer, s.city].filter(Boolean).join(', '),
    answers: { ...f.answers, autopay: s.autopay ? 'already' : f.answers.autopay },
  });
  const typeCustomer = (text) => set({ appointment_id: null, customer_id: null, typed: true, customer: text });

  const lightOn = (l) => (a.lights || []).includes(l);
  const toggleLight = (l) => ans({ lights_checked: true, no_lights: false, lights: lightOn(l) ? a.lights.filter((x) => x !== l) : [...(a.lights || []), l] });

  async function submit() {
    const left = missing(kind, f);
    setProblems(left);
    if (left.length) { setMsg(''); return; }
    setBusy(true);
    setMsg('');
    const answers = { ...f.answers };
    if (!f.termite) { delete answers.termite; delete answers.termite_why; }
    const report = {
      id: f.id, kind, tech_id: f.tech_id, day: f.day,
      customer_id: f.customer_id || null, appointment_id: f.appointment_id || null, customer: f.customer || null,
      answers, improve: f.improve, tech_praise: f.tech_praise, tech_note: f.tech_note, told_tech: f.told_tech,
      truck_issues: kind === 'ride_along' ? truckItems(f.answers) : [],
    };
    const res = typeof navigator !== 'undefined' && navigator.onLine === false ? { ok: false, offline: true } : await sendReport(sb, report);
    if (res.ok || res.offline) {
      if (!res.ok) enqueue(report);
      clearDraft(kind);
      router.push(`/reports?${res.ok ? 'sent' : 'queued'}=1`);
      return;
    }
    setBusy(false);
    setMsg(`Couldn’t send it: ${res.problem}`);
  }

  if (!ready) return null;
  const suggested = Array.isArray(stops) ? stops.filter((s) => !s.checked).sort((x, y) => x.pick - y.pick).slice(0, 3) : [];
  const list = showAll ? (Array.isArray(stops) ? stops : []) : suggested;
  let n = 0;

  return (
    <form className="rf" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Step n={++n} bug="ant" tone="lime" title={kind === 'ride_along' ? 'The day' : 'The visit'}>
        <div className="row">
          <div className="calc-field">
            <span className="rf-label">Technician</span>
            <Picker label="Technician" value={f.tech_id} options={techOptions} placeholder="Pick a technician…"
              onChange={(v) => set({ tech_id: v, appointment_id: null, customer_id: null, customer: '', typed: false, termite: false })} />
          </div>
          {kind === 'ride_along' && (
            <label className="calc-field"><span className="rf-label">Date</span>
              <input type="date" value={f.day} max={today} onChange={(e) => set({ day: e.target.value })} />
            </label>
          )}
        </div>

        {kind === 'follow_behind' && f.tech_id && (
          <Q title="Customer" hint={`Suggested from ${name}’s stops in the last 7 days, picked at random so any stop could be checked. You can also choose another stop or type a customer’s name.`}>
            {stops === null && <p className="note">Loading stops…</p>}
            {stops?.error && <p className="error">Stops couldn’t load: {stops.error}</p>}
            {Array.isArray(stops) && stops.length === 0 && <p className="note">No completed stops for {name} in the last 7 days. Type the customer’s name below.</p>}
            {list.length > 0 && (
              <ul className="rf-stops">
                {list.map((s) => (
                  <li key={s.appointment_id}>
                    <button type="button" className={`rf-stop${s.appointment_id === f.appointment_id ? ' on' : ''}`} onClick={() => pickStop(s)}>
                      <span><b>{s.customer}</b>{s.city ? `, ${s.city}` : ''}</span>
                      <small>{shortDate(s.day)} · {s.service}{s.checked ? ' · already checked' : ''}</small>
                      {s.appointment_id === f.appointment_id && <span className="rf-stop-check" aria-hidden="true">✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {Array.isArray(stops) && stops.length > suggested.length && (
              <button type="button" className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show suggested only' : `See all ${stops.length} stops`}</button>
            )}
            <input value={f.typed ? f.customer || '' : ''} maxLength={120} placeholder="Not listed? Type the customer’s name and city"
              onChange={(e) => typeCustomer(e.target.value)} />
            {f.typed && f.customer && <p className="calc-hint">Typed in. Pick a stop above instead if they’re listed.</p>}
          </Q>
        )}
      </Step>

      {kind === 'ride_along' ? (
        <>
          <Step n={++n} bug="spider" title="Service">
            {RIDE_SERVICE.map((q) => (
              <Q key={q.key} title={q.q}><Choice label={q.q} options={YES_NO} value={a[q.key]} onChange={(v) => ans({ [q.key]: v })} /></Q>
            ))}
            <Q title="Was the tech able to upsell?"><Choice label="Upsell" options={RIDE_UPSELL} value={a.upsell} onChange={(v) => ans({ upsell: v })} /></Q>
          </Step>

          <Step n={++n} bug="tick" title="The truck">
            <Q title="Is the interior in good condition?"><Choice label="Interior" options={INTERIOR} value={a.interior} onChange={(v) => ans({ interior: v })} /></Q>
            <Q title="How clean is the truck?"><Scale label="Cleanliness" options={CLEAN} value={a.clean} onChange={(v) => ans({ clean: v })} /></Q>
            <Q title="Any warning lights on the dash?" hint="Pick every one that’s on. The tech and the office’s branch managers are told so it gets fixed.">
              <div className="rf-choice">
                <button type="button" className={`cp-chip${a.no_lights ? ' on' : ''}`} onClick={() => ans({ lights_checked: true, no_lights: true, lights: [], other_light: '' })}>None</button>
                {LIGHTS.map((l) => <button key={l} type="button" className={`cp-chip${lightOn(l) ? ' on' : ''}`} onClick={() => toggleLight(l)}>{l}</button>)}
              </div>
              <input value={a.other_light || ''} maxLength={80} placeholder="Other light (type it in)"
                onChange={(e) => ans({ other_light: e.target.value, lights_checked: true, no_lights: false })} />
            </Q>
          </Step>

          <Step n={++n} bug="cricket" title="Summary of the day">
            <textarea rows={4} value={a.summary || ''} onChange={(e) => ans({ summary: e.target.value })} placeholder="How did the day go? (managers only)" />
          </Step>
        </>
      ) : (
        <>
          <Step n={++n} bug="spider" title="Talking with the customer">
            <Q title="Is the person you’re speaking with on the account?"><Choice label="On the account" options={YES_NO} value={a.on_account} onChange={(v) => ans({ on_account: v })} /></Q>
            <Q title="Were they communicated with before and after service?"><Choice label="Communication" options={COMMS} value={a.comms} onChange={(v) => ans({ comms: v })} /></Q>
          </Step>

          <Step n={++n} bug="ant" title="Ratings">
            <Q title="Customer’s overall experience"><Scale label="Overall experience" options={EXPERIENCE} value={a.experience} onChange={(v) => ans({ experience: v })} /></Q>
            <Q title="Customer’s impression of the tech"><Scale label="Impression of the tech" options={IMPRESSION} value={a.impression} onChange={(v) => ans({ impression: v })} /></Q>
            <Q title="Webs (pest service)"><Scale label="Webs" options={WEBS} value={a.webs} onChange={(v) => ans({ webs: v })} /></Q>
            <Toggle checked={!!f.termite} onChange={(on) => set({ termite: on })}>I checked termite stations on this visit</Toggle>
            {f.termite && (
              <>
                <Q title="Termite stations (maintenance or install)" hint="Optional. Skip it if you didn’t get to them.">
                  <Scale label="Termite stations" options={TERMITE} value={a.termite} onChange={(v) => ans({ termite: v })} />
                </Q>
                <Q title="Why this rating?"><textarea rows={2} value={a.termite_why || ''} onChange={(e) => ans({ termite_why: e.target.value })} /></Q>
              </>
            )}
          </Step>

          <Step n={++n} bug="stinging" title="Sales">
            <Q title="Upsell opportunity"><Choice label="Upsell" options={FB_UPSELL} value={a.upsell} onChange={(v) => ans({ upsell: v })} /></Q>
            <input value={a.upsell_note || ''} maxLength={200} placeholder="Upsell notes (optional)" onChange={(e) => ans({ upsell_note: e.target.value })} />
            <Q title="Was auto-pay collected?"><Choice label="Auto-pay" options={FB_AUTOPAY} value={a.autopay} onChange={(v) => ans({ autopay: v })} /></Q>
          </Step>

          <Step n={++n} bug="cricket" title="Customer feedback">
            <Q title="Positive feedback" hint={`${name === 'the tech' ? 'The tech' : name} sees this, so they hear what customers love.`}>
              <textarea rows={2} value={a.positive || ''} onChange={(e) => ans({ positive: e.target.value })} />
            </Q>
            <Q title="Negative feedback" hint="Managers only."><textarea rows={2} value={a.negative || ''} onChange={(e) => ans({ negative: e.target.value })} placeholder="Nothing? Write “None.”" /></Q>
            <Q title="Anything they’d like to see improved?" hint="Managers only."><textarea rows={2} value={a.wish || ''} onChange={(e) => ans({ wish: e.target.value })} /></Q>
          </Step>
        </>
      )}

      <Step n={++n} bug="termite" tone="lime" className="rf-tech" kicker="The tech sees this part" title={`Feedback for ${name}`}>
        <p className="note">Everything above stays with managers. Lead with what they did well, then what to work on.</p>
        <Q title="What they did well">
          <textarea rows={3} value={f.tech_praise || ''} onChange={(e) => set({ tech_praise: e.target.value })} placeholder={PRAISE_HINT} />
        </Q>
        {kind === 'ride_along' && (
          <Q title="Where to improve">
            <div className="rf-skills">
              {SKILLS.map((s) => (
                <Toggle key={s.key} checked={f.improve.includes(s.key)}
                  onChange={(on) => set({ improve: on ? [...f.improve, s.key] : f.improve.filter((x) => x !== s.key) })}>{s.label}</Toggle>
              ))}
            </div>
          </Q>
        )}
        <Q title={kind === 'ride_along' ? 'What to work on' : 'One thing to work on'}>
          <textarea rows={3} value={f.tech_note} onChange={(e) => set({ tech_note: e.target.value })}
            placeholder={kind === 'ride_along' ? IMPROVE_HINT : 'One specific thing they can do better next time. Keep it constructive.'} />
        </Q>
        <div className="rf-told">
          <Toggle checked={f.told_tech} onChange={(on) => set({ told_tech: on })}>
            {kind === 'ride_along'
              ? 'I clearly explained to the tech what they can improve on.'
              : 'I reached out to the tech to let them know their work was checked and shared feedback.'}
          </Toggle>
          <p className="calc-hint">{kind === 'ride_along'
            ? 'Go over the “Where to improve” section with them before you leave.'
            : 'Techs who know their work can be checked anytime stay sharp. A quick call or text counts.'}</p>
          {!f.told_tech && <p className="rf-warn">This report counts toward your bonus only once this switch is on.</p>}
        </div>
      </Step>

      {problems.length > 0 && <p className="error" role="alert">Still needed: {problems.join(', ')}.</p>}
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="rf-foot">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Sending…' : `Send ${KIND_LABEL[kind].toLowerCase()}`}</button>
        <button type="button" className="link" onClick={() => { if (window.confirm('Clear this form and start over?')) { clearDraft(kind); setF(blank(kind, today)); setProblems([]); } }}>Start over</button>
        <p className="calc-hint">Saved on this phone as you go. No signal? It sends when you’re back online.</p>
      </div>
    </form>
  );
}
