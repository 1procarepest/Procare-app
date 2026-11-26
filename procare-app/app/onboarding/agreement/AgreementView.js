'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Toggle from '../../Toggle';
import Bug from '../../Bug';

const when = (t) => (t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const day = (t) => (t ? new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }) : '');
const STATE = {
  unsigned: ['Not signed yet', 'ev-warn'], resign: ['Changed · sign again', 'ev-warn'],
  company: ['Signed · waiting for ProCare', 'ev-chip'], done: ['Signed by both', 'ev-ok'],
};

function Blocks({ blocks }) {
  return blocks.map((b, i) => {
    if (b.h3) return <h4 key={i} className="ag-h4">{b.h3}</h4>;
    if (b.list) return <ul key={i} className="ag-list">{b.list.map((x, j) => <li key={j}>{x}</li>)}</ul>;
    if (b.table) {
      return (
        <table key={i} className="ag-table">
          <thead><tr>{b.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{b.table.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
        </table>
      );
    }
    // "1.1 Title. Text" → bold lead-in
    const m = b.p.match(/^(\d+(?:\.\d+)?\s[^.]{2,60}\.|[A-Z][A-Za-z’ ]{2,40} plan\.|Up front\.|General pest commission\.|Higher-value contracts\.|Termite and mosquito\.|Early termination\.|Background check\.)\s(.*)$/s);
    return <p key={i}>{m ? <><strong>{m[1]}</strong> {m[2]}</> : b.p}</p>;
  });
}

/** C-Suite: the fill-ins every agreement uses. */
function Settings({ co }) {
  const router = useRouter();
  const [f, setF] = useState(co);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setMsg('Saving…');
    const { id, updated_at, updated_by, ...rest } = f;
    const { error } = await createClient().from('agreement_settings').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', 1);
    setMsg(error ? `Couldn’t save: ${error.message}` : 'Saved. Every agreement uses these now; reps whose wording changed are asked to sign again.');
    if (!error) router.refresh();
  };
  const field = (k, label, rows) => (
    <label key={k} className="tr-field tr-wide"><span>{label}</span>
      {rows ? <textarea rows={rows} value={f[k] || ''} onChange={set(k)} /> : <input value={f[k] || ''} onChange={set(k)} />}
    </label>
  );
  return (
    <div className="tr-sec ag-settings">
      <p className="note">These fill in every rep’s agreement. Pay numbers come from Sales → Pay → Plans, and one rep’s extra terms go in their row there.</p>
      <div className="tr-grid">
        {field('company', 'Company (legal name)')}{field('company_desc', 'Company description')}
        {field('address', 'Address')}{field('county', 'Courts (county, state)')}
        {field('signer_name', 'Signs for ProCare (name)')}{field('signer_title', 'Their title')}
        {field('schedule', 'Work expectations (Exhibit A), one per line', 5)}
        {field('pricing', 'Pricing guidelines (Exhibit B), one per line', 6)}
        {field('equipment', 'Equipment (Exhibit E)', 3)}
      </div>
      <div className="panel-buttons"><button type="button" className="btn btn-small" onClick={save}>Save</button></div>
      {msg && <p className="note" role="status">{msg}</p>}
    </div>
  );
}

export default function AgreementView({ item, agreement: ag, state, oldCopy, history, mine, canCountersign, canEdit, co }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(false);
  const row = state.row;
  const [label, cls] = STATE[state.key];

  const post = async (body) => {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/agreement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error || `Something went wrong (${res.status}).`); else router.refresh();
    } catch { setErr('Couldn’t reach the app. Check your signal and try again.'); }
    setBusy(false);
  };
  const signer = ag.signer || { name: co.signer_name, title: co.signer_title };

  return (
    <>
      <div className="ag-bar no-print">
        <Link href="/onboarding" className="ag-back">‹ Training</Link>
        <div className="ag-bar-actions">
          {canEdit && <Toggle small checked={edit} onChange={setEdit}><span>Agreement settings</span></Toggle>}
          <button type="button" className="btn btn-small btn-quiet" onClick={() => window.print()}>Print or save as PDF</button>
        </div>
      </div>
      {edit && <div className="no-print"><Settings co={co} /></div>}
      {oldCopy && <p className="ob-due-bar no-print"><Bug kind="tick" size={20} /><span><strong>An earlier signed copy.</strong> <Link href={`/onboarding/agreement?year=${item.year}&rep=${item.employee_id}`}>See the current agreement</Link>.</span></p>}

      <article className="ag-doc">
        <header className="ag-head">
          <img src="/logo.png" alt="Procare" className="ag-logo" />
          <div className="ag-head-text">
            <p className="ag-kicker"><Bug kind="ant" size={13} />{ag.company} · {ag.year}</p>
            <h1 className="ag-title">{ag.title}</h1>
            <p className="ag-sub">{ag.name} · January 1 – December 31, {ag.year}</p>
          </div>
          <span className={`ev-chip ${cls} ag-state`}>{label}</span>
        </header>

        <div className="ag-body">
          {ag.sections.map((s) => (
            <section key={s.id} className={`ag-sec${s.id.startsWith('ex') ? ' ag-exhibit' : ''}`}>
              {s.h && <h2 className="ag-h">{s.h}</h2>}
              <Blocks blocks={s.blocks} />
            </section>
          ))}
        </div>

        <footer className="ag-sign">
          <div className="ag-sig">
            <p className="rc-label">Contractor</p>
            {row ? (
              <>
                <p className="ag-script">{row.signed_name}</p>
                <p className="ag-sig-line">{ag.name} · signed electronically {when(row.signed_at)}</p>
              </>
            ) : mine && !oldCopy ? (
              <div className="ag-form no-print">
                <label className="tr-field"><span>Type your full name to sign: {ag.name}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={ag.name} />
                </label>
                <Toggle checked={agree} onChange={setAgree}>
                  <span>I’ve read this whole agreement and agree to it</span>
                  <span className="note">Typing your name and tapping Sign is your signature.</span>
                </Toggle>
                <button type="button" className="btn" disabled={busy || !agree || !name.trim()} onClick={() => post({ action: 'sign', year: item.year, hash: ag.hash, name })}>
                  {busy ? 'Signing…' : 'Sign agreement'}
                </button>
              </div>
            ) : (
              <p className="ag-sig-line">{ag.name} · not signed yet</p>
            )}
          </div>
          <div className="ag-sig">
            <p className="rc-label">{ag.company}</p>
            {row?.company_signed_at ? (
              <>
                <p className="ag-script">{row.company_signed_name}</p>
                <p className="ag-sig-line">By {row.company_signed_name}{signer.title && row.company_signed_name === signer.name ? `, ${signer.title}` : ''} · signed electronically {when(row.company_signed_at)}</p>
              </>
            ) : row && canCountersign && !oldCopy ? (
              <div className="no-print">
                <p className="ag-sig-line">{item.name.split(' ')[0]} signed {day(row.signed_at)}. Sign for ProCare:</p>
                <button type="button" className="btn" disabled={busy} onClick={() => post({ action: 'countersign', year: item.year, rep: item.employee_id, hash: ag.hash })}>
                  {busy ? 'Signing…' : 'Sign for ProCare'}
                </button>
              </div>
            ) : (
              <p className="ag-sig-line">By {signer.name || '________________'}{signer.title ? `, ${signer.title}` : ''} · {row ? 'waiting' : 'after the contractor signs'}</p>
            )}
          </div>
          {err && <p className="error no-print" role="status">{err}</p>}
        </footer>
      </article>

      {history.length > 0 && (
        <section className="ag-history no-print">
          <h2 className="fin-h2">Signed copies</h2>
          <ul className="ob-so-list">
            {history.map((h) => (
              <li key={h.id}>
                <Link href={`/onboarding/agreement?year=${item.year}&rep=${item.employee_id}&signed=${h.id}`}>{h.title}</Link>
                <span className={`ev-chip ${h.current ? 'ev-ok' : ''}`}>{h.current ? 'current' : 'earlier'} · {day(h.signed_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
