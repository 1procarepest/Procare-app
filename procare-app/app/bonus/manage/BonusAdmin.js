'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OFFICES, OFFICE_NAME, RANK, roleTitle, shortDate } from '@/lib/labels';
import { KINDS, KIND_ORDER, equalWeights, fmt, money0, money2, quarterName, whereName } from '@/lib/bonus';
import Toggle from '../../Toggle';
import Picker from '../../Picker';
import GoalCard from '../GoalCard';

const fullName = (p) => `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// ---------- Quarterly bonuses (stored as the yearly amount in bonus_plans; entered and shown per quarter) ----------
function Amounts({ people, plans, year, sb, router }) {
  const [showAll, setShowAll] = useState(false);
  const saved = Object.fromEntries(plans.map((p) => [p.employee_id, Number(p.amount) / 4]));
  const [vals, setVals] = useState(() => Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])));
  const [msg, setMsg] = useState('');
  const list = people.filter((p) => showAll || (RANK[p.level] || 0) >= 2 || saved[p.id] > 0);
  const save = async (p) => {
    const quarter = Number(vals[p.id] || 0);
    if (!(quarter >= 0)) return;
    const { error } = await sb.from('bonus_plans').upsert({ employee_id: p.id, year, amount: quarter * 4 });
    setMsg(error ? `Couldn’t save ${p.first_name}: ${error.message}` : `Saved ${p.first_name}: ${money0(quarter)} a quarter (${money0(quarter * 4)} for ${year}).`);
    router.refresh();
  };
  return (
    <section className="rc-panel"><div className="rc-panel-body rf-sec">
      <h2>Quarterly bonuses for {year}</h2>
      <p className="note">What each person can earn per quarter, split across that quarter’s goals. Leave it blank or 0 for people without a bonus.</p>
      <Toggle checked={showAll} onChange={setShowAll}>Show everyone (not just leads and up)</Toggle>
      {msg && <p className={msg.startsWith('Saved') ? 'ok' : 'error'} role="status">{msg}</p>}
      <ul className="bn-amounts">
        {list.map((p) => (
          <li key={p.id}>
            <span><b>{fullName(p)}</b><small>{roleTitle(p.department, p.level)}{p.office ? ` · ${OFFICE_NAME[p.office]}` : ''}</small></span>
            <span className="calc-input"><span className="calc-affix">$</span>
              <input type="number" min="0" step="50" value={vals[p.id] ?? ''} placeholder="0" aria-label={`${fullName(p)} quarterly bonus`}
                onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} onBlur={() => { if (String(saved[p.id] ?? '') !== String(vals[p.id] ?? '')) save(p); }} />
            </span>
            <small className="note">{Number(vals[p.id] || 0) > 0 ? `a quarter · ${money0(Number(vals[p.id]) * 4)} a year` : ''}</small>
          </li>
        ))}
      </ul>
    </div></section>
  );
}

// ---------- Goal set editor ----------
const goalName = (kind) => KINDS[kind].name || KINDS[kind].label;
const blankGoal = (kind = 'tech_sales') => ({ kind, label: goalName(kind), target: '', start_value: '', weight: 20, due_date: '' });

function SetEditor({ initial, people, starts, techCount, history = {}, onSave, onCancel, busy }) {
  const [d, setD] = useState(initial);
  const leaders = people.filter((p) => (RANK[p.level] || 0) >= 2);
  const leaderOf = (n) => leaders.find((p) => fullName(p) === String(n || '').trim());
  const [custom, setCustom] = useState(() => !!initial.name && !leaderOf(initial.name));
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const setGoal = (i, patch) => setD((x) => ({ ...x, goals: x.goals.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const total = d.goals.reduce((t, g) => t + Number(g.weight || 0), 0);
  const startHints = starts[d.office || 'all'] || {};
  const techs = techCount[d.office || 'all'] || 0;
  const candidates = people.filter((p) => !d.members.includes(p.id) && ((RANK[p.level] || 0) >= 2 || p.department === 'administrative'));

  return (
    <div className="bn-editor">
      <div className="row">
        <div className="calc-field"><span className="rf-label">Name</span>
          <Picker label="Name" value={custom ? '__custom' : (leaderOf(d.name)?.id || '')} placeholder="Pick a leader…"
            options={[...leaders.map((p) => ({ value: p.id, label: fullName(p), sub: `${roleTitle(p.department, p.level)}${p.office ? `, ${OFFICE_NAME[p.office]}` : ''}` })),
              { value: '__custom', label: 'Custom name…', sub: 'e.g. West service' }]}
            onChange={(v) => {
              if (v === '__custom') { setCustom(true); return; }
              const p = people.find((x) => x.id === v);
              setCustom(false);
              set({ name: fullName(p), members: d.members.includes(v) ? d.members : [v, ...d.members] });
            }} />
          {custom && <input value={d.name} placeholder="West service" autoFocus onChange={(e) => set({ name: e.target.value })} />}
        </div>
        <div className="calc-field"><span className="rf-label">Numbers from</span>
          <Picker label="Numbers from" value={d.office || ''} onChange={(v) => set({ office: v || null })}
            options={[{ value: '', label: 'Company-wide' }, ...OFFICES.map((o) => ({ value: o.key, label: o.name }))]} />
        </div>
      </div>

      <div className="calc-field">
        <span className="rf-q-title">Who’s on these goals</span>
        <div className="chips">
          {d.members.map((id) => {
            const p = people.find((x) => x.id === id);
            return <button key={id} type="button" className="chip on" onClick={() => set({ members: d.members.filter((x) => x !== id) })} aria-label={`Remove ${fullName(p)}`}>{fullName(p) || 'Former employee'} ×</button>;
          })}
        </div>
        <Picker label="Add a person" value="" placeholder="+ Add a person…" onChange={(v) => { if (v) set({ members: [...d.members, v] }); }}
          options={candidates.map((p) => ({ value: p.id, label: fullName(p), sub: `${roleTitle(p.department, p.level)}${p.office ? `, ${OFFICE_NAME[p.office]}` : ''}` }))} />
        {d.members.length > 1 && (
          <Toggle checked={d.shared} onChange={(on) => set({ shared: on })}>
            {d.shared ? 'Shared goals: everyone works toward the same goals' : 'Separate goals: saving makes a copy for each person to change'}
          </Toggle>
        )}
      </div>

      <div className="calc-field">
        <span className="rf-q-title">Goals</span>
        <ul className="bn-edit-goals">
          {d.goals.map((g, i) => {
            const k = KINDS[g.kind];
            return (
              <li key={g.id || `new-${i}`}>
                <div className="calc-row">
                  <div className="calc-field bn-grow"><span className="rf-label">Measures</span>
                    <Picker label="Measures" value={g.kind} search={false} onChange={(v) => setGoal(i, { kind: v, label: !g.label || g.label === k.label || g.label === goalName(g.kind) ? goalName(v) : g.label })}
                      options={KIND_ORDER.map((key) => ({ value: key, label: KINDS[key].label }))} />
                  </div>
                  <label className="calc-field bn-grow">Name on the goal<input value={g.label} onChange={(e) => setGoal(i, { label: e.target.value })} /></label>
                </div>
                <div className="calc-row">
                  {k.type !== 'project' && (
                    <label className="calc-field">Goal
                      <span className="calc-input">{k.unit === '$' && <span className="calc-affix">$</span>}
                        <input type="number" step="any" value={g.target} onChange={(e) => setGoal(i, { target: e.target.value })} />
                        {k.unit && k.unit !== '$' && <span className="calc-affix">{k.unit}</span>}</span>
                    </label>
                  )}
                  {k.type === 'improve' && (
                    <label className="calc-field">Starting number
                      <input type="number" step="any" value={g.start_value ?? ''} onChange={(e) => setGoal(i, { start_value: e.target.value })}
                        placeholder={startHints[g.kind] !== null && startHints[g.kind] !== undefined ? `auto: ${fmt(g.kind, startHints[g.kind])}` : 'auto (day 1)'} />
                    </label>
                  )}
                  {k.type === 'project' && (
                    <label className="calc-field">Due<input type="date" value={g.due_date || ''} onChange={(e) => setGoal(i, { due_date: e.target.value })} /></label>
                  )}
                  <label className="calc-field">Share
                    <span className="calc-input"><input type="number" min="0" max="100" step="any" value={g.weight} onChange={(e) => setGoal(i, { weight: e.target.value })} /><span className="calc-affix">%</span></span>
                  </label>
                  <button type="button" className="cp-x" aria-label="Remove goal" onClick={() => set({ goals: d.goals.filter((_, j) => j !== i) })}>×</button>
                </div>
                {(() => {
                  const h = (history[d.office || 'all'] || {})[g.kind];
                  if (!h) return null;
                  const one = (name, x) => (x && x.v !== null && x.v !== undefined
                    ? <button type="button" className="bn-past-btn" title="Use as the goal" onClick={() => setGoal(i, { target: String(k.unit === '%' ? Math.round(x.v * 10) / 10 : Math.round(x.v)) })}>
                        {name}: <b>{x.approx ? '≈ ' : ''}{fmt(g.kind, x.v)}</b></button>
                    : <span className="bn-past-none">{name}: not in the app</span>);
                  return <p className="bn-past">{one(history.prevName, h.prev)}{one(history.lyName, h.ly)}<small>Tap a number to use it as the goal.</small></p>;
                })()}
                <p className="calc-hint">{k.hint}{k.type === 'improve' ? ' Leave the starting number blank to record it automatically on day 1.' : ''}
                  {g.kind === 'reports' && techs > 0 && <> <button type="button" className="link" onClick={() => setGoal(i, { target: String(techs * 4) })}>Use {techs} techs × 4 = {techs * 4}</button></>}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="panel-buttons">
          <button type="button" className="btn btn-small btn-quiet" onClick={() => set({ goals: [...d.goals, blankGoal(KIND_ORDER[d.goals.length % KIND_ORDER.length])] })}>+ Add goal</button>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => { const w = equalWeights(d.goals.length); set({ goals: d.goals.map((g, i) => ({ ...g, weight: w[i] })) }); }}>Split evenly</button>
        </div>
        <p className={Math.abs(total - 100) < 0.01 ? 'calc-hint' : 'rf-warn'}>Shares add up to {Math.round(total * 100) / 100}%{Math.abs(total - 100) < 0.01 ? '.' : ' (they should add up to 100%).'}</p>
      </div>

      <div className="panel-buttons">
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => onSave(d)}>{busy ? 'Saving…' : 'Save goals'}</button>
        <button type="button" className="btn btn-small btn-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Goals({ sets, people, year, quarter, range, today, starts, techCount, history, sb, router }) {
  const [editing, setEditing] = useState(null);   // a draft, or null
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const draftOf = (s) => ({
    id: s.id, name: s.name, office: s.office, shared: true, members: s.members.map((m) => m.employee_id),
    goals: s.goals.map((g) => ({ ...g, start_value: g.start_value ?? '', due_date: g.due_date || '' })),
  });
  const fresh = () => ({ id: null, name: '', office: null, shared: true, members: [], goals: ['tech_sales', 'autopay', 'ar_past', 'cancel', 'reports'].map((k) => blankGoal(k)) });

  async function writeSet(id, name, office, members, goals, y = year, q = quarter) {
    let setId = id;
    if (setId) {
      const { error } = await sb.from('bonus_sets').update({ name, office, updated_at: new Date().toISOString() }).eq('id', setId);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('bonus_sets').insert({ year: y, quarter: q, name, office }).select('id').single();
      if (error) throw error;
      setId = data.id;
    }
    let r = await sb.from('bonus_members').delete().eq('set_id', setId).not('employee_id', 'in', `(${members.join(',')})`);
    if (r.error) throw r.error;
    r = await sb.from('bonus_members').upsert(members.map((m) => ({ set_id: setId, employee_id: m })), { ignoreDuplicates: true });
    if (r.error) throw r.error;
    const keep = goals.filter((g) => g.id && id).map((g) => g.id);
    if (id) {
      r = keep.length ? await sb.from('bonus_goals').delete().eq('set_id', setId).not('id', 'in', `(${keep.join(',')})`)
        : await sb.from('bonus_goals').delete().eq('set_id', setId);
      if (r.error) throw r.error;
    }
    for (let i = 0; i < goals.length; i += 1) {
      const g = goals[i];
      const row = { set_id: setId, sort: i, kind: g.kind, label: g.label.trim() || goalName(g.kind), target: KINDS[g.kind].type === 'project' ? 1 : Number(g.target),
        start_value: KINDS[g.kind].type === 'improve' ? num(g.start_value) : null, weight: Number(g.weight || 0), due_date: g.due_date || null };
      r = g.id && id ? await sb.from('bonus_goals').update(row).eq('id', g.id) : await sb.from('bonus_goals').insert(row);
      if (r.error) throw r.error;
    }
    return setId;
  }

  async function save(d) {
    const problems = [];
    if (!d.name.trim()) problems.push('a name');
    if (!d.members.length) problems.push('at least one person');
    if (!d.goals.length) problems.push('at least one goal');
    d.goals.forEach((g) => {
      if (KINDS[g.kind].type !== 'project' && !(String(g.target).trim() !== '' && !Number.isNaN(Number(g.target)))) problems.push(`a goal number for “${g.label || KINDS[g.kind].label}”`);
      if (KINDS[g.kind].type === 'project' && !g.due_date) problems.push(`a due date for “${g.label}”`);
    });
    if (problems.length) { setMsg(`Still needed: ${problems.join(', ')}.`); return; }
    setBusy(true);
    setMsg('');
    try {
      if (d.shared || d.members.length === 1) {
        await writeSet(d.id, d.name.trim(), d.office, d.members, d.goals);
      } else {
        // Separate goals: the first person keeps this set, everyone else gets their own copy to change
        for (let i = 0; i < d.members.length; i += 1) {
          const p = people.find((x) => x.id === d.members[i]);
          await writeSet(i === 0 ? d.id : null, `${d.name.trim()} · ${p?.first_name || 'copy'}`, d.office, [d.members[i]],
            i === 0 ? d.goals : d.goals.map(({ id, ...g }) => g));
        }
      }
      setEditing(null);
      setMsg('Saved.');
      router.refresh();
    } catch (e) {
      setMsg(`Couldn’t save: ${e.message}`);
    }
    setBusy(false);
  }

  async function remove(s) {
    if (!window.confirm(`Delete “${s.name}” and its goals? Anything logged toward them is deleted too.`)) return;
    const { error } = await sb.from('bonus_sets').delete().eq('id', s.id);
    setMsg(error ? `Couldn’t delete: ${error.message}` : 'Deleted.');
    router.refresh();
  }

  async function copyNext(s) {
    const nq = quarter === 4 ? { y: year + 1, q: 1 } : { y: year, q: quarter + 1 };
    setBusy(true);
    try {
      await writeSet(null, s.name, s.office, s.members.map((m) => m.employee_id),
        s.goals.map(({ id, ...g }) => ({ ...g, start_value: '', due_date: '' })), nq.y, nq.q);
      setMsg(`Copied “${s.name}” to ${quarterName(nq.y, nq.q)}. Starting numbers will be recorded on day 1; check the goals there.`);
    } catch (e) { setMsg(`Couldn’t copy: ${e.message}`); }
    setBusy(false);
  }

  if (editing) {
    return (
      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>{editing.id ? `Edit ${editing.name}` : `New goals for ${quarterName(year, quarter)}`}</h2>
        {msg && <p className={msg.startsWith('Still') || msg.startsWith('Couldn') ? 'error' : 'ok'} role="alert">{msg}</p>}
        <SetEditor initial={editing} people={people} starts={starts} techCount={techCount} history={history} busy={busy} onSave={save} onCancel={() => { setEditing(null); setMsg(''); }} />
      </div></section>
    );
  }

  return (
    <>
      <div className="panel-buttons bn-actions">
        <button type="button" className="btn btn-small" onClick={() => { setMsg(''); setEditing(fresh()); }}>New goals</button>
      </div>
      {msg && <p className={msg.startsWith('Couldn') ? 'error' : 'ok'} role="status">{msg}</p>}
      {sets.length === 0 && <p className="note">No goals for {quarterName(year, quarter)} yet. Click “New goals”, or go back a quarter and copy last quarter’s.</p>}
      {sets.map((s) => (
        <section key={s.id} className="rc-panel"><div className="rc-panel-body rf-sec">
          <div className="rf-head">
            <h2>{s.name}</h2>
            <span className="note">{whereName(s.office)} · {s.members.map((m) => fullName(m)).join(', ') || 'Nobody yet'}</span>
          </div>
          {s.approved_at && <p className="ok">Approved and paid {shortDate(String(s.approved_at).slice(0, 10))}. Locked.</p>}
          <ul className="bn-people">
            {s.score.people.map((p) => {
              const m = s.members.find((x) => x.employee_id === p.id);
              return <li key={p.id}><b>{fullName(m)}</b> {s.score.final ? '' : 'earning so far '}{money2(p.earned)} of {money2(p.quarter)}{!s.score.final && today >= range.from ? ` · at this pace ${money2(p.projected)}` : ''}</li>;
            })}
          </ul>
          <ul className="bn-goals">{s.score.goals.map((g) => <GoalCard key={g.id} g={g} quarter={0} final={!!s.score.final} />)}</ul>
          <div className="panel-buttons">
            {!s.approved_at && <button type="button" className="btn btn-small btn-quiet" onClick={() => { setMsg(''); setEditing(draftOf(s)); }}>Edit</button>}
            <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => copyNext(s)}>Copy to next quarter</button>
            {!s.approved_at && <button type="button" className="btn btn-small btn-quiet" onClick={() => remove(s)}>Delete</button>}
          </div>
        </div></section>
      ))}
    </>
  );
}

// ---------- Approve: proof, and finished quarters ----------
function Approve({ pending, sets, range, today, sb, router }) {
  const [notes, setNotes] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const review = async (e, ok) => {
    const { data, error } = await sb.rpc('review_bonus_entry', { p_id: e.id, p_approve: ok, p_note: notes[e.id] || null });
    setMsg(error ? `Couldn’t save: ${error.message}` : data ? (ok ? 'Approved.' : 'Turned down.') : 'That quarter is already locked.');
    router.refresh();
  };
  const over = today > range.to;
  const approveSet = async (s) => {
    const total = s.score.people.reduce((t, p) => t + p.earned, 0);
    if (!window.confirm(`Approve ${s.name} for ${money2(total)} in total? The numbers lock and each person can cash out their share.`)) return;
    setBusy(true);
    const results = {
      goals: s.score.goals.map(({ id, kind, label, weight, target, start, actual, progress, pay, type, unit, due_date }) => ({ id, kind, label, weight, target, start, actual, progress, pay, type, unit, due_date })),
      people: s.score.people.map((p) => ({ id: p.id, quarter: p.quarter, earned: p.earned, amount: p.earned })),
      through: s.score.through,
    };
    const { data, error } = await sb.rpc('approve_bonus_set', { p_set: s.id, p_results: results });
    setMsg(error ? `Couldn’t approve: ${error.message}` : data ? `Approved ${s.name}. Each person sees it in their Earnings.` : 'It was already approved.');
    setBusy(false);
    router.refresh();
  };

  return (
    <>
      {msg && <p className={msg.startsWith('Couldn') ? 'error' : 'ok'} role="status">{msg}</p>}
      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>Proof to approve ({pending.length})</h2>
        <p className="note">Things people logged with proof (posts, ad spend, projects). They count once approved.</p>
        {pending.length === 0 ? <p className="note">Nothing waiting. 🎉</p> : (
          <ul className="payouts-list">
            {pending.map((e) => (
              <li key={e.id} className="payout-card">
                <div className="payout-head">
                  <span><b>{fullName(e.employees)}</b> · {e.bonus_goals?.label}<br />
                    <small className="note">{e.bonus_goals?.bonus_sets?.name} · {shortDate(e.day)} · {e.bonus_goals?.kind === 'cost_per_customer' ? `$${Number(e.qty).toFixed(2)} ad spend` : e.bonus_goals?.kind === 'project' ? 'Project done' : `${Number(e.qty)}`}</small></span>
                </div>
                {e.note && <p>{e.note}</p>}
                {e.link && <p><a href={e.link} target="_blank" rel="noreferrer">Open the proof</a></p>}
                <div className="calc-row">
                  <input value={notes[e.id] || ''} placeholder="Note (optional)" maxLength={160} onChange={(x) => setNotes({ ...notes, [e.id]: x.target.value })} style={{ flex: '1 1 220px' }} />
                  <button type="button" className="btn btn-small" onClick={() => review(e, true)}>Approve</button>
                  <button type="button" className="btn btn-small btn-quiet" onClick={() => review(e, false)}>Turn down</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div></section>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>Finish the quarter</h2>
        {!over ? <p className="note">This quarter ends {shortDate(range.to)}. Come back after that to approve the final numbers.</p> : sets.length === 0 ? <p className="note">No goals this quarter.</p> : (
          <ul className="bn-close">
            {sets.map((s) => {
              const total = s.score.people.reduce((t, p) => t + p.earned, 0);
              const caughtUp = s.score.through && s.score.through >= range.to;
              const waiting = s.entries.filter((e) => e.status === 'pending').length;
              return (
                <li key={s.id}>
                  <span><b>{s.name}</b><small>{s.score.people.map((p) => `${fullName(s.members.find((m) => m.employee_id === p.id))} ${money2(p.earned)}`).join(' · ')}</small></span>
                  {s.approved_at ? <span className="pill pill-good">Approved</span> : (
                    <span className="bn-close-act">
                      {!caughtUp && <small className="rf-warn">Numbers are only through {s.score.through ? shortDate(s.score.through) : '–'}; wait a day.</small>}
                      {waiting > 0 && <small className="rf-warn">{waiting} proof entr{waiting === 1 ? 'y' : 'ies'} still waiting above.</small>}
                      <button type="button" className="btn btn-small" disabled={busy || !caughtUp} onClick={() => approveSet(s)}>Approve {money2(total)}</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div></section>
    </>
  );
}

// ---------- Settings ----------
function SettingsTab({ settings, sources, cancelReasons = [], people, sb, router }) {
  const [skip, setSkip] = useState(settings.cancel_reasons_skip || []);
  const reasons = useMemo(() => {
    const m = {};
    cancelReasons.forEach((r) => { m[r.reason] = (m[r.reason] || 0) + Number(r.n || 0); });
    skip.forEach((r) => { if (!(r in m)) m[r] = 0; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [cancelReasons, skip]);
  const [reportTo, setReportTo] = useState(settings.report_to || []);
  const [off, setOff] = useState(settings.sources_off || []);
  const [scale, setScale] = useState(settings.scale);
  const [msg, setMsg] = useState('');
  const names = useMemo(() => {
    const m = {};
    sources.forEach((s) => { m[s.source] = (m[s.source] || 0) + Number(s.n || 0); });
    off.forEach((s) => { if (!(s in m)) m[s] = 0; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [sources, off]);
  const save = async (patch, done) => {
    const { error } = await sb.from('bonus_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
    setMsg(error ? `Couldn’t save: ${error.message}` : done);
    router.refresh();
  };
  const leads = people.filter((p) => (RANK[p.level] || 0) >= 2 && !reportTo.includes(p.id));

  return (
    <>
      {msg && <p className={msg.startsWith('Couldn') ? 'error' : 'ok'} role="status">{msg}</p>}
      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>Who gets every report</h2>
        <p className="note">Every ride-along and follow-behind is emailed to these people (Ryan Boyd, Operations Manager). They can also read all reports in the app.</p>
        <div className="chips">
          {reportTo.map((id) => {
            const p = people.find((x) => x.id === id);
            return <button key={id} type="button" className="chip on" onClick={() => { const v = reportTo.filter((x) => x !== id); setReportTo(v); save({ report_to: v }, 'Saved.'); }}>{fullName(p) || 'Former employee'} ×</button>;
          })}
        </div>
        <Picker label="Add a person" value="" placeholder="+ Add a person…" onChange={(id) => { if (id) { const v = [...reportTo, id]; setReportTo(v); save({ report_to: v }, 'Saved.'); } }}
          options={leads.map((p) => ({ value: p.id, label: fullName(p), sub: roleTitle(p.department, p.level) }))} />
      </div></section>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>Marketing sales: which sources count</h2>
        <p className="note">Marketing sales are core sales to new customers. Door-to-door, technician sales and office upsells never count. Switch off any other FieldRoutes source that isn’t marketing’s. (Counts are this quarter and last.)</p>
        {names.length === 0 ? <p className="note">No marketing sales yet to list sources from.</p> : (
          <ul className="bn-sources">
            {names.map(([s, n]) => (
              <li key={s}>
                <Toggle checked={!off.includes(s)} onChange={(on) => { const v = on ? off.filter((x) => x !== s) : [...off, s]; setOff(v); save({ sources_off: v }, on ? `“${s}” counts.` : `“${s}” no longer counts.`); }}>
                  {s} <small className="note">({n})</small>
                </Toggle>
              </li>
            ))}
          </ul>
        )}
      </div></section>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>Cancellation rate: which reasons count</h2>
        <p className="note">Switched off reasons (moving, money and billing) are left out of the cancellation rate goal. (Counts are this quarter and last.)</p>
        {reasons.length === 0 ? <p className="note">No cancels yet to list reasons from.</p> : (
          <ul className="bn-sources">
            {reasons.map(([r, n]) => (
              <li key={r}>
                <Toggle checked={!skip.includes(r)} onChange={(on) => { const v = on ? skip.filter((x) => x !== r) : [...skip, r]; setSkip(v); save({ cancel_reasons_skip: v }, on ? `“${r}” counts.` : `“${r}” no longer counts.`); }}>
                  {r} <small className="note">({n})</small>
                </Toggle>
              </li>
            ))}
          </ul>
        )}
      </div></section>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>Sliding scale</h2>
        <p className="note">For count goals (sales, reports, logged items). Reaching the goal pays 100%. Below it, pay drops along a straight line down to the lowest level; under that, nothing.</p>
        <div className="calc-row">
          <label className="calc-field">Lowest level that pays
            <span className="calc-input"><input type="number" min="0" max="99" value={scale.floor} onChange={(e) => setScale({ ...scale, floor: e.target.value })} /><span className="calc-affix">% of goal</span></span></label>
          <label className="calc-field">…pays
            <span className="calc-input"><input type="number" min="0" max="100" value={scale.floor_pay} onChange={(e) => setScale({ ...scale, floor_pay: e.target.value })} /><span className="calc-affix">%</span></span></label>
        </div>
        <p className="calc-hint">With these numbers: {[100, 90, 80, 70, 60].map((p) => {
          const f = Number(scale.floor); const fp = Number(scale.floor_pay);
          const pay = p >= 100 ? 100 : p < f ? 0 : fp + ((p - f) * (100 - fp)) / (100 - f);
          return `${p}% → ${Math.round(pay)}%`;
        }).join(' · ')} · under {scale.floor}% → nothing</p>
        <Toggle checked={!!scale.stretch} onChange={(on) => setScale({ ...scale, stretch: on })}>Stretch: beating a count goal keeps paying, up to a cap</Toggle>
        {scale.stretch && (
          <label className="calc-field">Cap<span className="calc-input"><input type="number" min="100" max="200" value={scale.cap} onChange={(e) => setScale({ ...scale, cap: e.target.value })} /><span className="calc-affix">%</span></span></label>
        )}
        <div className="panel-buttons">
          <button type="button" className="btn btn-small" onClick={() => {
            const s = { floor: Number(scale.floor), floor_pay: Number(scale.floor_pay), stretch: !!scale.stretch, cap: Number(scale.cap) };
            if (!(s.floor >= 0 && s.floor < 100 && s.floor_pay >= 0 && s.floor_pay <= 100 && s.cap >= 100)) { setMsg('Couldn’t save: check the numbers.'); return; }
            save({ scale: s }, 'Scale saved.');
          }}>Save scale</button>
        </div>
      </div></section>
    </>
  );
}

export default function BonusAdmin(props) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const common = { sb, router };
  if (props.tab === 'amounts') return <Amounts key={props.year} {...common} people={props.people} plans={props.plans} year={props.year} />;
  if (props.tab === 'approve') return <Approve {...common} pending={props.pending} sets={props.sets} range={props.range} today={props.today} />;
  if (props.tab === 'settings') return <SettingsTab {...common} settings={props.settings} sources={props.sources} cancelReasons={props.cancelReasons} people={props.people} />;
  return <Goals {...common} sets={props.sets} people={props.people} year={props.year} quarter={props.quarter} range={props.range}
    today={props.today} starts={props.starts} techCount={props.techCount} history={props.history} />;
}
