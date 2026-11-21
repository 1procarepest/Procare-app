'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, roleTitle } from '@/lib/labels';
import { SCALE, VALUES } from '@/lib/reviews';
import Toggle from '../../Toggle';
import ReviewCard from '../../ReviewCard';

const blank = (today) => ({ id: null, year: Number(today.slice(0, 4)), review_date: today, ratings: {}, strengths: '', growth: '', goals: '', notes: '', shared: false });

function ReviewForm({ person, start, onDone }) {
  const router = useRouter();
  const [f, setF] = useState(start);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }));
  const rate = (k, n) => setF((cur) => ({ ...cur, ratings: { ...cur.ratings, [k]: cur.ratings[k] === n ? undefined : n } }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const row = {
      employee_id: person.id, year: Number(f.year), review_date: f.review_date, ratings: f.ratings,
      strengths: f.strengths.trim() || null, growth: f.growth.trim() || null, goals: f.goals.trim() || null,
      notes: f.notes.trim() || null, shared: f.shared, updated_at: new Date().toISOString(),
    };
    const db = createClient().from('employee_reviews');
    const { error } = f.id ? await db.update(row).eq('id', f.id) : await db.insert(row);
    setBusy(false);
    if (error) { setMsg(`Couldn’t save: ${error.message}`); return; }
    router.refresh();
    onDone();
  }

  async function remove() {
    if (!f.id || !window.confirm(`Delete the ${f.year} review for ${person.first_name}? This can’t be undone.`)) return;
    setBusy(true);
    const { error } = await createClient().from('employee_reviews').delete().eq('id', f.id);
    setBusy(false);
    if (error) { setMsg(`Couldn’t delete: ${error.message}`); return; }
    router.refresh();
    onDone();
  }

  return (
    <form className="panel rv-form" onSubmit={save}>
      <h3>{f.id ? `Edit ${f.year} review` : 'New year review'} · {person.first_name} {person.last_name}</h3>
      <div className="rv-top">
        <div><label htmlFor="rv-year">Year</label><input id="rv-year" type="number" min="2020" max="2100" value={f.year} onChange={(e) => set('year')(e.target.value)} /></div>
        <div><label htmlFor="rv-date">Review date</label><input id="rv-date" type="date" value={f.review_date} onChange={(e) => set('review_date')(e.target.value)} /></div>
      </div>
      <fieldset className="rv-values">
        <legend>G.R.E.E.N. values <span className="note">tap 1 (needs work) to 5 (outstanding)</span></legend>
        {VALUES.map((v) => (
          <div key={v.key} className="rv-value">
            <div><b><span className="rv-letter">{v.letter}</span> {v.name}</b><small>{v.hint}</small></div>
            <div className="rv-scale" role="group" aria-label={v.name}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={`rv-dot${f.ratings[v.key] === n ? ' on' : ''}`} aria-pressed={f.ratings[v.key] === n} title={SCALE[n]} onClick={() => rate(v.key, n)}>{n}</button>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      {[['strengths', 'Strengths', 'What they did well this year'], ['growth', 'Areas to grow', 'Where to improve'], ['goals', 'Goals for next year', 'What they’re working toward'], ['notes', 'Overall comments', '']].map(([k, label, ph]) => (
        <div key={k}><label htmlFor={`rv-${k}`}>{label}</label><textarea id={`rv-${k}`} rows={3} value={f[k]} placeholder={ph} onChange={(e) => set(k)(e.target.value)} /></div>
      ))}
      <Toggle checked={f.shared} onChange={set('shared')}>
        <span>Share with {person.first_name}</span>
        <span className="note">{f.shared ? 'They can read it on their My Profile page' : 'Only reviewers can see it'}</span>
      </Toggle>
      <div className="panel-buttons">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save review'}</button>
        <button className="btn btn-quiet" type="button" onClick={onDone}>Cancel</button>
        {f.id && <button className="btn btn-danger" type="button" disabled={busy} onClick={remove}>Delete</button>}
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
    </form>
  );
}

// 6-month check-ins and yearly reviews (change 73): share or unshare, or delete
function ShareButton({ r, name }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const flip = async () => {
    setBusy(true); setErr('');
    const { error } = await createClient().from('employee_reviews').update({ shared: !r.shared, updated_at: new Date().toISOString() }).eq('id', r.id);
    setBusy(false);
    if (error) setErr(error.message); else router.refresh();
  };
  const remove = async () => {
    if (!window.confirm(`Delete this for ${name}? This can’t be undone.`)) return;
    const { error } = await createClient().from('employee_reviews').delete().eq('id', r.id);
    if (error) setErr(error.message); else router.refresh();
  };
  return (
    <>
      <Toggle small checked={!!r.shared} disabled={busy} onChange={flip}><span>Shared with {name}</span></Toggle>
      <button type="button" className="link" onClick={remove}>Delete</button>
      {err && <span className="error">{err}</span>}
    </>
  );
}

export default function ReviewsView({ people, pick, reviews, today, hrForms }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const person = people.find((p) => p.id === pick);
  const shown = people.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q.trim().toLowerCase()));

  if (person) {
    return (
      <section className="section reviews">
        <p><Link href="/admin/reviews">‹ All people</Link></p>
        <div className="admin-head">
          <h1>{person.first_name} {person.last_name}</h1>
          <p className="note">{roleTitle(person.department, person.level)}{person.office ? `, ${OFFICE_NAME[person.office] || person.office}` : ''}</p>
        </div>
        {editing ? (
          <ReviewForm key={editing.id || 'new'} person={person} start={editing} onDone={() => setEditing(null)} />
        ) : (
          <div className="panel-buttons">
            {hrForms && <Link className="btn btn-small" href={`/reports/review?kind=checkin&person=${person.id}`}>+ 6 Month Check-In</Link>}
            {hrForms && <Link className="btn btn-small" href={`/reports/review?kind=yearly&person=${person.id}`}>+ Yearly Review</Link>}
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setEditing(blank(today))}>+ G.R.E.E.N. ratings</button>
          </div>
        )}
        <div className="rv-list">
          {reviews.length === 0 && <p className="note">No reviews yet.</p>}
          {reviews.map((r) => (
            <ReviewCard key={r.id} r={r}>
              <span className={`badge${r.shared ? '' : ' badge-warn'}`}>{r.shared ? 'Shared' : 'Not shared yet'}</span>
              {r.kind === 'checkin' || r.kind === 'yearly'
                ? <ShareButton r={r} name={person.first_name} />
                : <button type="button" className="link" onClick={() => setEditing({ ...blank(today), ...r, strengths: r.strengths || '', growth: r.growth || '', goals: r.goals || '', notes: r.notes || '', ratings: r.ratings || {} })}>Edit</button>}
            </ReviewCard>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="section reviews">
      <div className="admin-head">
        <h1>Reviews</h1>
        <p className="note">6-month check-ins, yearly reviews (start them in Forms) and G.R.E.E.N. ratings, saved in the app. Turn on “Share” and they can read it on their My Profile page.</p>
      </div>
      <input type="search" className="rv-search" placeholder="Find a person…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a person" />
      <ul className="people">
        {shown.map((p) => (
          <li key={p.id}>
            <Link className="person" href={`/admin/reviews?person=${p.id}`}>
              <span className="person-main">
                <span className="person-name">{p.first_name} {p.last_name}</span>
                <span className="person-role">{roleTitle(p.department, p.level)}, {OFFICE_NAME[p.office] || 'No office'}</span>
              </span>
              <span className="person-flags"><span className="note">{p.reviews ? `${p.reviews} review${p.reviews > 1 ? 's' : ''} · last ${p.last_year}` : 'No reviews yet'}</span></span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="note">Nobody matches.</li>}
      </ul>
    </section>
  );
}
