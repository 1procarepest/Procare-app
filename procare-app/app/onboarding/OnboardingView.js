'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEPT_LABEL, OFFICES, OFFICE_NAME } from '@/lib/labels';
import { groupOf } from '@/lib/onboarding';
import OpsHero from '../ops/OpsHero';
import Picker from '../Picker';
import Toggle from '../Toggle';
import Bug from '../Bug';

const GROUP_HEAD = { Onboarding: 'Onboarding · required', Training: 'Training · when you need it' };
const DEPTS = ['technician', 'sales', 'administrative', 'wildlife'];
const day = (t) => (t ? new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }) : '');
const kindOf = (d) => (d.kind === 'link' ? 'Link' : /^image\//.test(d.mime || '') ? 'Picture' : 'PDF');
const openHref = (d) => (d.kind === 'link' ? d.url : `/api/onboarding-doc?id=${d.id}`);

/** Who a document is for, in words (shown to the people who manage Onboarding). */
function audience(d, peopleById) {
  if (d.people?.length) return d.people.map((id) => peopleById[id]?.name || 'someone who left').join(', ');
  const depts = (d.departments || []).map((k) => DEPT_LABEL[k] || k).join(', ');
  const offices = (d.offices || []).map((k) => OFFICE_NAME[k] || k).join(', ');
  if (depts || offices) return [depts || 'Every department', offices ? `in ${offices}` : ''].filter(Boolean).join(' ');
  return 'Everyone';
}

async function uploadFile(file) {
  const res = await fetch('/api/onboarding-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', name: file.name }) });
  const start = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(start.error || `Upload couldn’t start (${res.status}).`);
  const { error } = await createClient().storage.from('onboarding-docs').uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return { path: start.path, file_name: file.name, mime: file.type, size: file.size };
}

/* ---------- Add / change a document (C-Suite, the President, HR) ---------- */
function DocForm({ doc, people, categories, onDone }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({
    title: doc?.title || '', description: doc?.description || '', category: doc ? groupOf(doc.category) : 'Onboarding',
    kind: doc?.kind || 'file', url: doc?.url || '', departments: doc?.departments || [], offices: doc?.offices || [], people: doc?.people || [],
    needs_signoff: doc ? !!doc.needs_signoff : true, new_version: false,
  }));
  const [who, setWho] = useState(doc?.people?.length ? 'people' : doc?.departments?.length || doc?.offices?.length ? 'depts' : 'all');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      if (!f.title.trim()) throw new Error('Give it a title.');
      if (f.kind === 'file' && !doc?.path && !file) throw new Error('Pick a file to upload.');
      if (who === 'depts' && !f.departments.length && !f.offices.length) throw new Error('Pick at least one department or office, or choose Everyone.');
      if (who === 'people' && !f.people.length) throw new Error('Add at least one person, or choose Everyone.');
      const up = f.kind === 'file' && file ? await uploadFile(file) : {};
      const p = { ...f, ...up, needs_signoff: f.category === 'Onboarding' && f.needs_signoff, departments: who === 'depts' ? f.departments : [], offices: who === 'depts' ? f.offices : [], people: who === 'people' ? f.people : [] };
      const { error } = await createClient().rpc('save_onboarding_doc', { p_id: doc?.id || null, p });
      if (error) throw new Error(error.message);
      // A replaced file: remove the old one
      if (doc?.path && (up.path || f.kind === 'link')) {
        fetch('/api/onboarding-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup', path: doc.path }) }).catch(() => {});
      }
      onDone(); router.refresh();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm(`Remove “${doc.title}” from Onboarding? The file and everyone’s sign-offs on it are deleted too.`)) return;
    setBusy(true);
    const res = await fetch('/api/onboarding-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: doc.id }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || 'Couldn’t remove it.'); return; }
    onDone(); router.refresh();
  };

  const personOptions = people.filter((p) => !f.people.includes(p.id))
    .map((p) => ({ value: p.id, label: p.name, sub: `${DEPT_LABEL[p.department] || ''}${p.office ? ` · ${OFFICE_NAME[p.office] || p.office}` : ''}` }));

  return (
    <div className="tr-sec ob-form">
      <h3 className="ob-form-h">{doc ? `Change “${doc.title}”` : 'Add a document'}</h3>
      <div className="tr-grid">
        <label className="tr-field tr-wide"><span>Title</span><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Employee handbook" /></label>
        <div className="tr-field tr-wide"><span>Section</span>
          <div className="rc-seg" role="group" aria-label="Section">
            <button type="button" className={f.category === 'Onboarding' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, category: 'Onboarding', needs_signoff: true }))}>Onboarding · required</button>
            <button type="button" className={f.category === 'Training' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, category: 'Training', needs_signoff: false }))}>Training · optional</button>
          </div>
        </div>
        <label className="tr-field tr-wide"><span>What it is (optional)</span><input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="One line people see under the title" /></label>
      </div>

      <div className="ob-row">
        <div className="rc-seg" role="group" aria-label="File or link">
          <button type="button" className={f.kind === 'file' ? 'on' : ''} onClick={() => set('kind', 'file')}>PDF or picture</button>
          <button type="button" className={f.kind === 'link' ? 'on' : ''} onClick={() => set('kind', 'link')}>Link</button>
        </div>
        {f.kind === 'file' ? (
          <label className={`btn btn-small btn-quiet ob-pick${busy ? ' disabled' : ''}`}>
            {file ? file.name : doc?.file_name ? `Replace ${doc.file_name}` : 'Choose a file'}
            <input type="file" accept="application/pdf,image/*" hidden disabled={busy} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        ) : (
          <input className="ob-url" type="url" inputMode="url" placeholder="https://…" value={f.url} onChange={(e) => set('url', e.target.value)} aria-label="Link" />
        )}
      </div>

      <p className="rc-label">Who sees it</p>
      <div className="rc-seg" role="group" aria-label="Who sees it">
        <button type="button" className={who === 'all' ? 'on' : ''} onClick={() => setWho('all')}>Everyone</button>
        <button type="button" className={who === 'depts' ? 'on' : ''} onClick={() => setWho('depts')}>Departments &amp; offices</button>
        <button type="button" className={who === 'people' ? 'on' : ''} onClick={() => setWho('people')}>Certain people</button>
      </div>
      {who === 'depts' && (
        <div className="ob-groups">
          <p className="rc-label">Departments <span className="note">(none picked = every department)</span></p>
          <div className="chips">
            {DEPTS.map((k) => (
              <button key={k} type="button" className={`chip${f.departments.includes(k) ? ' on' : ''}`}
                onClick={() => set('departments', f.departments.includes(k) ? f.departments.filter((x) => x !== k) : [...f.departments, k])}>{DEPT_LABEL[k]}</button>
            ))}
          </div>
          <p className="rc-label">Offices <span className="note">(none picked = every office)</span></p>
          <div className="chips">
            {OFFICES.map((o) => (
              <button key={o.key} type="button" className={`chip${f.offices.includes(o.key) ? ' on' : ''}`}
                onClick={() => set('offices', f.offices.includes(o.key) ? f.offices.filter((x) => x !== o.key) : [...f.offices, o.key])}>{o.name}</button>
            ))}
          </div>
          <p className="note">Sent to: {audience({ departments: f.departments, offices: f.offices }, {})}</p>
        </div>
      )}
      {who === 'people' && (
        <div className="ob-people">
          <div className="chips">
            {f.people.map((id) => (
              <button key={id} type="button" className="chip on" onClick={() => set('people', f.people.filter((x) => x !== id))} aria-label={`Remove ${byId[id]?.name || 'person'}`}>
                {byId[id]?.name || 'Someone who left'} ×
              </button>
            ))}
          </div>
          <Picker value="" options={personOptions} placeholder="Add a person…" label="Add a person" onChange={(id) => id && set('people', [...f.people, id])} />
          <p className="note">Only these people see it (and C-Suite and HR). Good for someone’s own contract.</p>
        </div>
      )}

      {f.category === 'Onboarding' && (
        <Toggle checked={f.needs_signoff} onChange={(v) => set('needs_signoff', v)}>
          <span>Read and sign</span>
          <span className="note">Each person taps “I’ve read this”, and the date is kept. Turn off when a test covers it (like the handbook).</span>
        </Toggle>
      )}
      {doc && f.category === 'Onboarding' && f.needs_signoff && (
        <Toggle checked={f.new_version} onChange={(v) => set('new_version', v)}>
          <span>Ask everyone to sign again</span>
          <span className="note">Use this when the document changed in a way people need to read.</span>
        </Toggle>
      )}

      {msg && <p className="error" role="status">{msg}</p>}
      <div className="panel-buttons">
        <button type="button" className="btn btn-small" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={onDone}>Cancel</button>
        {doc && <button type="button" className="btn btn-small btn-quiet ob-remove" disabled={busy} onClick={remove}>Remove</button>}
      </div>
    </div>
  );
}

/* ---------- One document ---------- */
function DocCard({ d, manage, peopleById, onEdit }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sign = async () => {
    setBusy(true); setErr('');
    const { error } = await createClient().rpc('sign_onboarding_doc', { p_id: d.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setAsk(false); router.refresh();
  };
  const toSign = d.mine && d.needs_signoff && !d.signed;
  return (
    <article className={`ob-card${toSign ? ' ob-due' : ''}`}>
      <div className="ob-card-top">
        <span className={`ob-kind ob-kind-${kindOf(d).toLowerCase()}`}>{kindOf(d)}</span>
        {d.needs_signoff && d.mine && (d.signed
          ? <span className="ev-chip ev-ok">Signed {day(d.read_at)}</span>
          : <span className="ev-chip ev-warn">{d.read_at ? 'Updated · sign again' : 'Needs your sign-off'}</span>)}
      </div>
      <h3 className="ob-title"><a href={openHref(d)} target="_blank" rel="noreferrer">{d.title}</a></h3>
      {d.description && <p className="note">{d.description}</p>}
      {manage && <p className="ob-for">For: {audience(d, peopleById)}{d.needs_signoff ? ` · sign-off${d.version > 1 ? ` (version ${d.version})` : ''}` : ''}</p>}
      <div className="ob-actions">
        <a className="btn btn-small" href={openHref(d)} target="_blank" rel="noreferrer">{d.kind === 'link' ? 'Open link' : 'Open'}</a>
        {toSign && !ask && <button type="button" className="btn btn-small btn-quiet" onClick={() => setAsk(true)}>I’ve read this</button>}
        {manage && <button type="button" className="btn btn-small btn-quiet" onClick={onEdit}>Change</button>}
      </div>
      {ask && (
        <div className="ob-confirm">
          <p>I’ve read <strong>{d.title}</strong> and understand it.</p>
          <div className="panel-buttons">
            <button type="button" className="btn btn-small" disabled={busy} onClick={sign}>{busy ? 'Saving…' : 'Yes, sign'}</button>
            <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => setAsk(false)}>Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </article>
  );
}

/* ---------- Who has signed (C-Suite and HR: everyone; managers: their people) ---------- */
function Signoffs({ list }) {
  const [open, setOpen] = useState({});
  const shown = list.filter((s) => s.people.length);
  if (!shown.length) return null;
  return (
    <section className="ob-signoffs">
      <h2 className="fin-h2">Sign-offs</h2>
      {shown.map((s) => {
        const done = s.people.filter((p) => p.read_at);
        const left = s.people.filter((p) => !p.read_at);
        return (
          <div key={s.id} className="ob-so">
            <div className="ob-so-head">
              <strong>{s.title}</strong>
              <span className={`ev-chip ${left.length ? 'ev-warn' : 'ev-ok'}`}>{done.length} of {s.people.length} signed</span>
            </div>
            <div className="ob-so-bar" aria-hidden="true"><span style={{ width: `${(done.length / s.people.length) * 100}%` }} /></div>
            <Toggle small checked={!!open[s.id]} onChange={(v) => setOpen({ ...open, [s.id]: v })}>Show who</Toggle>
            {open[s.id] && (
              <ul className="ob-so-list">
                {s.people.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}<small>{DEPT_LABEL[p.department] || ''}{p.office ? ` · ${OFFICE_NAME[p.office] || p.office}` : ''}</small></span>
                    {p.read_at ? <span className="ev-chip ev-ok">{day(p.read_at)}</span> : <span className="ev-chip ev-warn">{p.old ? 'Signed an old version' : 'Not yet'}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

const AG_STATE = {
  unsigned: ['Needs your signature', 'ev-warn'], resign: ['Changed · sign again', 'ev-warn'],
  company: ['Signed · waiting for ProCare', ''], done: ['Signed by both', 'ev-ok'],
};
const AG_TEAM = { unsigned: ['Not signed', 'ev-warn'], resign: ['Needs to sign again', 'ev-warn'], company: ['Needs ProCare’s signature', 'ev-warn'], done: ['Signed by both', 'ev-ok'] };
const agHref = (a) => `/onboarding/agreement?year=${a.year}&rep=${a.employee_id}`;

/** Sales agreements (change 93): written from each rep's pay plan; who has signed, for the people who manage pay. */
function Agreements({ team }) {
  const [year, setYear] = useState(() => team[0]?.year);
  const years = [...new Set(team.map((a) => a.year))];
  if (!team.length) return null;
  const list = team.filter((a) => a.year === year);
  const done = list.filter((a) => a.state === 'done').length;
  return (
    <section className="ob-signoffs">
      <h2 className="fin-h2">Sales agreements</h2>
      <p className="note">Written from each rep’s plan in Sales → Pay → Plans. When a plan changes, that rep is asked to sign again.</p>
      <div className="ob-so">
        <div className="ob-so-head">
          {years.length > 1
            ? <div className="rc-seg" role="group" aria-label="Year">{years.map((y) => <button key={y} type="button" className={y === year ? 'on' : ''} onClick={() => setYear(y)}>{y}</button>)}</div>
            : <strong>{year}</strong>}
          <span className={`ev-chip ${done === list.length ? 'ev-ok' : 'ev-warn'}`}>{done} of {list.length} signed by both</span>
        </div>
        <div className="ob-so-bar" aria-hidden="true"><span style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
        <ul className="ob-so-list">
          {list.map((a) => (
            <li key={`${a.employee_id}-${a.year}`}>
              <span><Link href={agHref(a)}>{a.name}</Link><small>{a.title.replace(' Independent Contractor Agreement', '')}{a.office ? ` · ${OFFICE_NAME[a.office] || a.office}` : ''}</small></span>
              <span className={`ev-chip ${AG_TEAM[a.state][1]}`}>{AG_TEAM[a.state][0]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A test card (change 94): passed, or take / retake it. */
function QuizCard({ z }) {
  const passed = !!z.passed_at;
  return (
    <article className={`ob-card ob-quiz${z.mine && !passed ? ' ob-due' : ''}`}>
      <div className="ob-card-top">
        <span className="ob-kind ob-kind-test">Test</span>
        {z.mine && (passed
          ? <span className="ev-chip ev-ok">Passed {day(z.passed_at)}</span>
          : <span className="ev-chip ev-warn">{z.tries ? `Last try ${z.last_score}/${z.ask_count}` : 'Needs your 100%'}</span>)}
      </div>
      {passed && <img className="ob-quiz-sticker" src="/stickers/best-in-pest-cybertruck-320.png" alt="" aria-hidden="true" />}
      <h3 className="ob-title"><Link href={`/onboarding/quiz/${z.id}`}>{z.title}</Link></h3>
      <p className="note">{z.ask_count} questions · {z.pass_pct}% to pass · retake as often as you like</p>
      <div className="ob-actions"><Link className="btn btn-small" href={`/onboarding/quiz/${z.id}`}>{passed ? 'Take it again' : z.tries ? 'Try again' : 'Take the test'}</Link></div>
    </article>
  );
}

/** Who has passed each test (C-Suite and HR: everyone; managers: their people). */
function QuizStatus({ list }) {
  const [open, setOpen] = useState({});
  const shown = list.filter((s) => s.people.length);
  if (!shown.length) return null;
  return (
    <section className="ob-signoffs">
      <h2 className="fin-h2">Tests</h2>
      {shown.map((s) => {
        const done = s.people.filter((p) => p.passed_at);
        return (
          <div key={s.id} className="ob-so">
            <div className="ob-so-head">
              <strong>{s.title}</strong>
              <span className={`ev-chip ${done.length === s.people.length ? 'ev-ok' : 'ev-warn'}`}>{done.length} of {s.people.length} passed</span>
            </div>
            <div className="ob-so-bar" aria-hidden="true"><span style={{ width: `${(done.length / s.people.length) * 100}%` }} /></div>
            <Toggle small checked={!!open[s.id]} onChange={(v) => setOpen({ ...open, [s.id]: v })}>Show who</Toggle>
            {open[s.id] && (
              <ul className="ob-so-list">
                {s.people.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}<small>{DEPT_LABEL[p.department] || ''}{p.office ? ` · ${OFFICE_NAME[p.office] || p.office}` : ''}</small></span>
                    {p.passed_at ? <span className="ev-chip ev-ok">{day(p.passed_at)}</span>
                      : <span className="ev-chip ev-warn">{p.tries ? `${p.tries} tr${p.tries === 1 ? 'y' : 'ies'} · best ${p.best}%` : 'Not taken'}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default function OnboardingView({ data, agreements = { mine: [], team: [] }, quizzes: qd = { quizzes: [], status: [] } }) {
  const manage = !!data.can_manage;
  const people = data.people || [];
  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const [edit, setEdit] = useState(null);   // doc id or 'new'
  const [all, setAll] = useState(false);    // managers: show every document, not just their own
  const docs = (data.docs || []).filter((d) => d.mine || (manage && all));
  const due = (data.docs || []).filter((d) => d.mine && d.needs_signoff && !d.signed);
  const agDue = agreements.mine.filter((a) => a.state === 'unsigned' || a.state === 'resign');
  const myQuizzes = (qd.quizzes || []).filter((z) => z.mine || (manage && all));
  const quizDue = (qd.quizzes || []).filter((z) => z.mine && !z.passed_at);
  const categories = ['Onboarding', 'Training'];
  const groups = categories.filter((g) => docs.some((d) => groupOf(d.category) === g) || myQuizzes.some((z) => groupOf(z.category) === g));

  return (
    <>
      <OpsHero kicker="Onboarding" title="Training &" em="documents" bug="ant" badge="/stickers/best-in-pest-cybertruck-320.png">
        The handbook, training, sales aids and contracts for you. Tap one to open it.
      </OpsHero>

      {due.length + agDue.length + quizDue.length > 0 && (
        <p className="ob-due-bar" role="status">
          <Bug kind="spider" size={20} />
          <span><strong>{due.length + agDue.length + quizDue.length} to do.</strong> {[due.length + agDue.length ? `${due.length + agDue.length} to read and sign` : '', quizDue.length ? `${quizDue.length} test${quizDue.length === 1 ? '' : 's'} to pass with 100%` : ''].filter(Boolean).join(', ')}.</span>
        </p>
      )}

      {agreements.mine.length > 0 && (
        <section className="inv-cat ob-cat">
          <h2 className="fin-h2">Your agreement</h2>
          <div className="ob-grid">
            {agreements.mine.map((a) => {
              const [label, cls] = AG_STATE[a.state];
              const toSign = a.state === 'unsigned' || a.state === 'resign';
              return (
                <article key={a.year} className={`ob-card ob-agree${toSign ? ' ob-due' : ''}`}>
                  <div className="ob-card-top"><span className="ob-kind">{a.year}</span><span className={`ev-chip ${cls}`}>{label}</span></div>
                  <h3 className="ob-title"><Link href={agHref(a)}>{a.title}</Link></h3>
                  <p className="note">{a.state === 'resign' ? 'Your pay plan or the agreement changed. Read the new version and sign it.' : 'Your contract with ProCare Sales, written from your pay plan for the year.'}</p>
                  <div className="ob-actions"><Link className="btn btn-small" href={agHref(a)}>{toSign ? 'Read and sign' : 'Open'}</Link></div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {manage && (
        <div className="tr-controls">
          <button type="button" className="btn btn-small" onClick={() => setEdit(edit === 'new' ? null : 'new')}>Add a document</button>
          <Toggle small checked={all} onChange={setAll}><span>Show every document, not just mine</span></Toggle>
        </div>
      )}
      {edit === 'new' && <DocForm people={people} categories={categories} onDone={() => setEdit(null)} />}

      {!docs.length && !agreements.mine.length && !myQuizzes.length && <p className="panel">{manage ? 'Nothing here yet. Add the employee handbook under Onboarding first.' : 'Nothing here for you yet.'}</p>}

      {groups.map((g) => (
        <section key={g} className="inv-cat ob-cat">
          <h2 className="fin-h2">{GROUP_HEAD[g]}</h2>
          <div className="ob-grid">
            {myQuizzes.filter((z) => groupOf(z.category) === g).map((z) => <QuizCard key={z.id} z={z} />)}
            {docs.filter((d) => groupOf(d.category) === g).map((d) => (
              edit === d.id
                ? <DocForm key={d.id} doc={d} people={people} categories={categories} onDone={() => setEdit(null)} />
                : <DocCard key={d.id} d={d} manage={manage} peopleById={peopleById} onEdit={() => setEdit(d.id)} />
            ))}
          </div>
        </section>
      ))}

      <Agreements team={agreements.team} />
      <QuizStatus list={qd.status || []} />
      <Signoffs list={data.signoffs || []} />
    </>
  );
}
