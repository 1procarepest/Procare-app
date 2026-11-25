'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEPT_LABEL, OFFICE_NAME } from '@/lib/labels';
import OpsHero from '../ops/OpsHero';
import Picker from '../Picker';
import Toggle from '../Toggle';
import Bug from '../Bug';

const CATEGORIES = ['Handbook', 'Training', 'Sales aids', 'Contracts', 'Policies'];
const DEPTS = ['technician', 'sales', 'administrative', 'wildlife'];
const day = (t) => (t ? new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }) : '');
const kindOf = (d) => (d.kind === 'link' ? 'Link' : /^image\//.test(d.mime || '') ? 'Picture' : 'PDF');
const openHref = (d) => (d.kind === 'link' ? d.url : `/api/onboarding-doc?id=${d.id}`);

/** Who a document is for, in words (shown to the people who manage Onboarding). */
function audience(d, peopleById) {
  if (d.people?.length) return d.people.map((id) => peopleById[id]?.name || 'someone who left').join(', ');
  if (d.departments?.length) return d.departments.map((k) => DEPT_LABEL[k] || k).join(', ');
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
    title: doc?.title || '', description: doc?.description || '', category: doc?.category || 'Training',
    kind: doc?.kind || 'file', url: doc?.url || '', departments: doc?.departments || [], people: doc?.people || [],
    needs_signoff: !!doc?.needs_signoff, new_version: false,
  }));
  const [who, setWho] = useState(doc?.people?.length ? 'people' : doc?.departments?.length ? 'depts' : 'all');
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
      if (who === 'depts' && !f.departments.length) throw new Error('Pick at least one department, or choose Everyone.');
      if (who === 'people' && !f.people.length) throw new Error('Add at least one person, or choose Everyone.');
      const up = f.kind === 'file' && file ? await uploadFile(file) : {};
      const p = { ...f, ...up, departments: who === 'depts' ? f.departments : [], people: who === 'people' ? f.people : [] };
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
        <label className="tr-field"><span>Section</span>
          <input list="ob-cats" value={f.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="ob-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
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
        <button type="button" className={who === 'depts' ? 'on' : ''} onClick={() => setWho('depts')}>Departments</button>
        <button type="button" className={who === 'people' ? 'on' : ''} onClick={() => setWho('people')}>Certain people</button>
      </div>
      {who === 'depts' && (
        <div className="chips ob-chips">
          {DEPTS.map((k) => (
            <button key={k} type="button" className={`chip${f.departments.includes(k) ? ' on' : ''}`}
              onClick={() => set('departments', f.departments.includes(k) ? f.departments.filter((x) => x !== k) : [...f.departments, k])}>{DEPT_LABEL[k]}</button>
          ))}
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

      <Toggle checked={f.needs_signoff} onChange={(v) => set('needs_signoff', v)}>
        <span>Needs sign-off</span>
        <span className="note">Each person taps “I’ve read this”, and the date is kept.</span>
      </Toggle>
      {doc && f.needs_signoff && (
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

export default function OnboardingView({ data }) {
  const manage = !!data.can_manage;
  const people = data.people || [];
  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const [edit, setEdit] = useState(null);   // doc id or 'new'
  const [all, setAll] = useState(false);    // managers: show every document, not just their own
  const docs = (data.docs || []).filter((d) => d.mine || (manage && all));
  const due = (data.docs || []).filter((d) => d.mine && d.needs_signoff && !d.signed);
  const categories = [...new Set([...CATEGORIES, ...(data.docs || []).map((d) => d.category)])];
  const groups = [...new Set(docs.map((d) => d.category))].sort((a, b) => {
    const ia = CATEGORIES.indexOf(a), ib = CATEGORIES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  return (
    <>
      <OpsHero kicker="Onboarding" title="Training &" em="documents" bug="ant">
        The handbook, training, sales aids and contracts for you. Tap one to open it.
      </OpsHero>

      {due.length > 0 && (
        <p className="ob-due-bar" role="status">
          <Bug kind="spider" size={20} />
          <span><strong>{due.length} to sign.</strong> Open {due.length === 1 ? 'it' : 'each one'}, read it, then tap “I’ve read this”.</span>
        </p>
      )}

      {manage && (
        <div className="tr-controls">
          <button type="button" className="btn btn-small" onClick={() => setEdit(edit === 'new' ? null : 'new')}>Add a document</button>
          <Toggle small checked={all} onChange={setAll}><span>Show every document, not just mine</span></Toggle>
        </div>
      )}
      {edit === 'new' && <DocForm people={people} categories={categories} onDone={() => setEdit(null)} />}

      {!docs.length && <p className="panel">{manage ? 'Nothing here yet. Add the employee handbook first, with Needs sign-off on.' : 'Nothing here for you yet.'}</p>}

      {groups.map((g) => (
        <section key={g} className="inv-cat ob-cat">
          <h2 className="fin-h2">{g}</h2>
          <div className="ob-grid">
            {docs.filter((d) => d.category === g).map((d) => (
              edit === d.id
                ? <DocForm key={d.id} doc={d} people={people} categories={categories} onDone={() => setEdit(null)} />
                : <DocCard key={d.id} d={d} manage={manage} peopleById={peopleById} onEdit={() => setEdit(d.id)} />
            ))}
          </div>
        </section>
      ))}

      <Signoffs list={data.signoffs || []} />
    </>
  );
}
