'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import { KIND_LABEL, SKILL_LABEL } from '@/lib/reports';
import { QUESTIONS, REVIEW_KIND } from '@/lib/reviews';
import Toggle from '../Toggle';
import Picker from '../Picker';
import { BugTile } from '../Bug';

const BUGS = ['spider', 'ant', 'cricket', 'tick', 'stinging', 'termite', 'roach'];

function Step({ n, bug, tone = 'sage', title, kicker, children }) {
  return (
    <section className="rf-card">
      <div className="rf-step">
        <BugTile kind={bug} tone={tone} size={38} />
        <div><p className="rf-kicker">{kicker || `Step ${n}`}</p><h2>{title}</h2></div>
      </div>
      <div className="rf-sec">{children}</div>
    </section>
  );
}

/** The last ride-along / follow-behind feedback the tech already heard, to go over together. */
function RecentRides({ person }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!person) { setRows(null); return; }
    let live = true;
    createClient().rpc('recent_field_feedback', { p_person: person, p_limit: 3 }).then(({ data }) => { if (live) setRows(data || []); });
    return () => { live = false; };
  }, [person]);
  if (!person || rows === null) return null;
  if (!rows.length) return <p className="calc-hint">No ride-alongs or follow-behinds on file for them yet.</p>;
  return (
    <ul className="rv-rides">
      {rows.map((r) => (
        <li key={r.id}>
          <b>{KIND_LABEL[r.kind] || r.kind} · {shortDate(r.day)}</b>
          {r.tech_praise && <p><span className="note">Did well:</span> {r.tech_praise}</p>}
          {(r.improve || []).length > 0 && <p><span className="note">Where to improve:</span> {r.improve.map((k) => SKILL_LABEL[k] || k).join(', ')}</p>}
          {r.tech_note && <p><span className="note">To work on:</span> {r.tech_note}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Forms → 6 Month Check-In / Yearly Review (change 73): Ally's questions, answered together with the person and saved
 * to employee_reviews (Settings → Reviews; on their My Profile page once shared).
 */
export default function ReviewForm({ kind, people, today, start }) {
  const router = useRouter();
  const questions = QUESTIONS[kind];
  const [f, setF] = useState({ person: start || '', day: today, answers: {}, shared: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const ans = (k, v) => setF((x) => ({ ...x, answers: { ...x.answers, [k]: v } }));
  const person = people.find((p) => p.id === f.person);
  const first = person ? person.first_name : 'them';
  const options = useMemo(() => people.map((p) => ({ value: p.id, label: `${p.first_name} ${p.last_name}`, group: OFFICE_NAME[p.office] || 'No office' })), [people]);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    if (!person) { setMsg(`Pick who this ${REVIEW_KIND[kind].short} is for.`); return; }
    const answers = Object.fromEntries(Object.entries(f.answers).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v));
    if (!Object.keys(answers).length) { setMsg('Answer at least one question first.'); return; }
    setBusy(true);
    const { error } = await createClient().from('employee_reviews').insert({
      employee_id: person.id, kind, year: Number(f.day.slice(0, 4)), review_date: f.day, answers, shared: f.shared,
    });
    setBusy(false);
    if (error) { setMsg(`Couldn’t save: ${error.message}`); return; }
    router.push(`/admin/reviews?person=${person.id}`);
    router.refresh();
  }

  return (
    <form className="rf" onSubmit={save}>
      <Step n={1} bug="spider" tone="lime" title="The day">
        <div className="rf-q">
          <p className="rf-q-title">Team member</p>
          <Picker label="Team member" value={f.person} options={options} placeholder="Pick a team member…" onChange={(v) => set({ person: v })} />
        </div>
        <div className="rf-q">
          <p className="rf-q-title">Date</p>
          <input type="date" value={f.day} max={today} onChange={(e) => set({ day: e.target.value })} />
        </div>
      </Step>

      {questions.map((x, i) => (
        <Step key={x.key} n={i + 2} bug={BUGS[i % BUGS.length]} title={x.q}>
          {x.rides && <RecentRides person={f.person} />}
          <textarea rows={4} value={f.answers[x.key] || ''} onChange={(e) => ans(x.key, e.target.value)}
            placeholder={x.rides ? 'What you talked about, and what they’re working on next.' : `${first === 'them' ? 'Their' : `${first}’s`} answer, in their words.`} />
        </Step>
      ))}

      <div className="rf-told">
        <Toggle checked={f.shared} onChange={(on) => set({ shared: on })}>
          <span>Share with {first}</span>
          <span className="note">{f.shared ? 'They can read it on their My Profile page' : 'Only reviewers can see it (you can share it later in Settings → Reviews)'}</span>
        </Toggle>
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="rf-foot">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : `Save ${REVIEW_KIND[kind].short}`}</button>
        <p className="calc-hint">Saved with their reviews in Settings → Reviews.</p>
      </div>
    </form>
  );
}
