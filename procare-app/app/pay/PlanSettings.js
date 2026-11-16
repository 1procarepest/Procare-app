'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GROUPS, GROUP_LABEL, n } from '@/lib/comp';
import { BugTile } from '../Bug';

const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function Field({ label, value, onChange, prefix, suffix, step = 1, width }) {
  return (
    <label className="calc-field" style={width ? { maxWidth: width } : null}>
      <span className="rc-label">{label}</span>
      <span className="calc-input">
        {prefix && <span className="calc-affix">{prefix}</span>}
        <input type="number" inputMode="decimal" step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="calc-affix">{suffix}</span>}
      </span>
    </label>
  );
}

function AssignRow({ rep, row, year, save, scales }) {
  const [v, setV] = useState({
    plan: row?.plan || '', scale: row?.scale || 'first_year',
    upfront: row?.upfront ?? '', start_rate: row?.start_rate ?? '', step_rate: row?.step_rate ?? '', note: row?.note || '',
  });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const dirty = JSON.stringify(v) !== JSON.stringify({
    plan: row?.plan || '', scale: row?.scale || 'first_year', upfront: row?.upfront ?? '', start_rate: row?.start_rate ?? '', step_rate: row?.step_rate ?? '', note: row?.note || '',
  });
  const go = () => (v.plan
    ? save(`${rep.name}’s ${year} plan`, (sb) => sb.from('comp_assignments').upsert({
      employee_id: rep.id, year, plan: v.plan, scale: v.scale,
      upfront: numOrNull(v.upfront), start_rate: numOrNull(v.start_rate), step_rate: numOrNull(v.step_rate),
      note: v.note.trim() || null, updated_at: new Date().toISOString(),
    }))
    : save(`${rep.name}’s ${year} plan`, (sb) => sb.from('comp_assignments').delete().eq('employee_id', rep.id).eq('year', year)));
  const isCom = v.plan === 'commission';
  return (
    <tr className={rep.active ? '' : 'pay-muted'}>
      <th scope="row">{rep.name}{!rep.active && ' (left)'}</th>
      <td>
        <select value={v.plan} onChange={set('plan')} aria-label={`${rep.name} plan`}>
          <option value="">No plan</option>
          <option value="commission">Commission</option>
          <option value="flat">Flat rate</option>
        </select>
      </td>
      <td>
        <select value={v.scale} onChange={set('scale')} disabled={!isCom} aria-label={`${rep.name} scale`}>
          {scales.map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}
        </select>
      </td>
      <td><input className="pay-small" type="number" placeholder="plan" value={v.upfront} onChange={set('upfront')} disabled={!isCom} aria-label={`${rep.name} up front`} /></td>
      <td><input className="pay-small" type="number" placeholder="scale" value={v.start_rate} onChange={set('start_rate')} disabled={!isCom} aria-label={`${rep.name} start rate`} /></td>
      <td><input className="pay-small" type="number" placeholder="scale" value={v.step_rate} onChange={set('step_rate')} disabled={!isCom} aria-label={`${rep.name} step`} /></td>
      <td><input value={v.note} onChange={set('note')} placeholder="Deal notes" aria-label={`${rep.name} note`} /></td>
      <td><button type="button" className="btn pay-btn" disabled={!dirty} onClick={go}>Save</button></td>
    </tr>
  );
}

export default function PlanSettings({ data, year, nextPlans }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [status, setStatus] = useState('');
  const [planYear, setPlanYear] = useState(year);
  const s0 = data.settings;
  const [s, setS] = useState({
    upfront: s0.upfront, hold_pct: s0.hold_pct, past_due_days: s0.past_due_days, clawback_days: s0.clawback_days,
    flat_pest: s0.flat_pest, flat_termite: s0.flat_termite, flat_mosquito: s0.flat_mosquito,
    termite_initial_pct: s0.termite_initial_pct ?? 100,
    bonus: (s0.bonus || []).map((b) => ({ ...b })), scales: JSON.parse(JSON.stringify(s0.scales || {})),
  });
  const [groups, setGroups] = useState(data.groups || {});
  const [addType, setAddType] = useState('');

  const save = async (label, fn) => {
    setStatus('Saving…');
    const { error } = await fn(sb);
    if (error) { setStatus(`Couldn’t save ${label}: ${error.message}`); return false; }
    setStatus(`${label} saved.`);
    router.refresh();
    return true;
  };
  const setNum = (k) => (v) => setS({ ...s, [k]: v });
  const setScale = (key, k) => (v) => setS({ ...s, scales: { ...s.scales, [key]: { ...s.scales[key], [k]: k === 'name' ? v : v } } });
  const setBonus = (i, k) => (v) => setS({ ...s, bonus: s.bonus.map((b, j) => (j === i ? { ...b, [k]: v } : b)) });

  const saveSettings = () => save('Pay settings', (c) => c.from('comp_settings').update({
    upfront: n(s.upfront), hold_pct: n(s.hold_pct), past_due_days: Math.round(n(s.past_due_days)), clawback_days: Math.round(n(s.clawback_days)),
    flat_pest: n(s.flat_pest), flat_termite: n(s.flat_termite), flat_mosquito: n(s.flat_mosquito),
    termite_initial_pct: n(s.termite_initial_pct),
    bonus: s.bonus.filter((b) => b.min !== '' && b.rate !== '').map((b) => ({ min: n(b.min), rate: n(b.rate) })).sort((x, y) => x.min - y.min),
    scales: Object.fromEntries(Object.entries(s.scales).map(([k, v]) => [k, { name: String(v.name || k), start: n(v.start), step: n(v.step), every: Math.max(1, Math.round(n(v.every))), max: n(v.max) }])),
    updated_at: new Date().toISOString(),
  }).eq('id', 1));

  const plans = planYear === year ? data.plans.filter((p) => p.year === year) : nextPlans;
  const scales = Object.entries(data.settings.scales || {});
  const unmapped = (data.types || []).filter((t) => !groups[t]).sort();

  return (
    <>
      {status && <p className="pay-status" role="status">{status}</p>}

      <section className="rc-panel">
        <div className="rc-panel-body pay-form">
          <div className="pay-form-head">
            <h2 className="cp-h"><BugTile kind="spider" tone="ink" size={30} /> Each rep’s plan</h2>
            <div className="rc-seg" role="group" aria-label="Plan year">
              {[year, year + 1].map((y) => <button key={y} type="button" className={planYear === y ? 'on' : ''} onClick={() => setPlanYear(y)}>{y}</button>)}
            </div>
          </div>
          <p className="calc-hint">A rep stays on one plan for the whole year and can switch on January 1. Leave up front, start rate and step blank to use the plan’s numbers; fill them in for a special deal.</p>
          <div className="pay-scroll">
            <table className="ops-table pay-assign">
              <thead><tr><th scope="col">Rep</th><th scope="col">Plan</th><th scope="col">Scale</th><th scope="col">Up front $</th><th scope="col">Start %</th><th scope="col">Step %</th><th scope="col">Notes</th><th scope="col"><span className="sr-only">Save</span></th></tr></thead>
              <tbody>
                {data.reps.map((r) => <AssignRow key={`${r.id}-${planYear}-${plans.find((p) => p.employee_id === r.id)?.updated_at || ''}`} rep={r} row={plans.find((p) => p.employee_id === r.id)} year={planYear} save={save} scales={scales} />)}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rc-panel">
        <div className="rc-panel-body pay-form">
          <h2 className="cp-h"><BugTile kind="ant" tone="forest" size={30} /> Commission plan</h2>
          <div className="pay-fields">
            <Field label="Up front per serviced sale" value={s.upfront} onChange={setNum('upfront')} prefix="$" />
            <Field label="Held back in Q1–Q3" value={s.hold_pct} onChange={setNum('hold_pct')} suffix="%" />
            <Field label="Past due after" value={s.past_due_days} onChange={setNum('past_due_days')} suffix="days" />
            <Field label="Clawback if canceled within" value={s.clawback_days} onChange={setNum('clawback_days')} suffix="days" />
            <label className="calc-field">
              <span className="rc-label">Termite initial payout</span>
              <span className="calc-input">
                <select value={String(n(s.termite_initial_pct))} onChange={(e) => setNum('termite_initial_pct')(e.target.value)}>
                  {[0, 50, 100].map((v) => <option key={v} value={String(v)}>{v}% of the initial</option>)}
                </select>
              </span>
            </label>
          </div>
          <p className="calc-hint">Termite sales pay the up-front amount plus this share of the initial price, the same Monday. Example: a $200 initial at {n(s.termite_initial_pct)}% pays ${n(s.upfront) + 2 * n(s.termite_initial_pct)}.</p>
          <h3 className="pay-sub">Pay scales</h3>
          {Object.entries(s.scales).map(([key, v]) => (
            <div key={key} className="pay-fields">
              <label className="calc-field"><span className="rc-label">Name</span><span className="calc-input"><input value={v.name} onChange={(e) => setScale(key, 'name')(e.target.value)} /></span></label>
              <Field label="Starts at" value={v.start} onChange={setScale(key, 'start')} suffix="%" step={0.5} />
              <Field label="Goes up" value={v.step} onChange={setScale(key, 'step')} suffix="%" step={0.5} />
              <Field label="Every" value={v.every} onChange={setScale(key, 'every')} suffix="sales" />
              <Field label="Up to" value={v.max} onChange={setScale(key, 'max')} suffix="%" />
            </div>
          ))}
          <h3 className="pay-sub">Bonus rates for one pest sale</h3>
          {s.bonus.map((b, i) => (
            <div key={i} className="pay-fields">
              <Field label="Contract value at least" value={b.min} onChange={setBonus(i, 'min')} prefix="$" step={10} />
              <Field label="Pays" value={b.rate} onChange={setBonus(i, 'rate')} suffix="%" />
              <button type="button" className="btn btn-quiet pay-btn" onClick={() => setS({ ...s, bonus: s.bonus.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn btn-quiet pay-btn" onClick={() => setS({ ...s, bonus: [...s.bonus, { min: '', rate: '' }] })}>Add a bonus level</button>

          <h2 className="spaced cp-h"><BugTile kind="cricket" tone="lime" size={30} /> Flat rate plan</h2>
          <div className="pay-fields">
            {GROUPS.map((g) => <Field key={g} label={GROUP_LABEL[g]} value={s[`flat_${g}`]} onChange={setNum(`flat_${g}`)} prefix="$" />)}
          </div>
          <button type="button" className="btn pay-btn" onClick={saveSettings}>Save plan settings</button>
        </div>
      </section>

      <section className="rc-panel">
        <div className="rc-panel-body pay-form">
          <h2 className="cp-h"><BugTile kind="roach" tone="sage" size={30} /> Which services pay</h2>
          <p className="calc-hint">FieldRoutes service types that count as pest, termite or mosquito sales. Anything not listed doesn’t pay commission or count toward a rate step.</p>
          <ul className="pay-groups">
            {Object.entries(groups).sort().map(([t, g]) => (
              <li key={t}>
                <span>{t}</span>
                <select value={g} aria-label={`${t} counts as`} onChange={async (e) => {
                  const grp = e.target.value;
                  if (await save(t, (c) => c.from('comp_service_groups').update({ grp }).eq('service_type', t))) setGroups({ ...groups, [t]: grp });
                }}>
                  {GROUPS.map((k) => <option key={k} value={k}>{GROUP_LABEL[k]}</option>)}
                </select>
                <button type="button" className="btn btn-quiet pay-btn" onClick={async () => {
                  if (await save(`Removing ${t}`, (c) => c.from('comp_service_groups').delete().eq('service_type', t))) {
                    const next = { ...groups }; delete next[t]; setGroups(next);
                  }
                }}>Remove</button>
              </li>
            ))}
          </ul>
          {unmapped.length > 0 && (
            <div className="pay-fields">
              <label className="calc-field"><span className="rc-label">Add a service type</span>
                <select value={addType} onChange={(e) => setAddType(e.target.value)}>
                  <option value="">Choose…</option>
                  {unmapped.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {GROUPS.map((g) => (
                <button key={g} type="button" className="btn btn-quiet pay-btn" disabled={!addType} onClick={async () => {
                  if (await save(addType, (c) => c.from('comp_service_groups').insert({ service_type: addType, grp: g }))) { setGroups({ ...groups, [addType]: g }); setAddType(''); }
                }}>Add as {GROUP_LABEL[g].toLowerCase()}</button>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
