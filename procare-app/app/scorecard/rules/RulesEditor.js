'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Toggle from '../../Toggle';
import { incentiveOn } from '@/lib/scorecard';

// Each incentive has an on/off switch (on_<key> in the rules). Only Sales starts on.
const GROUPS = [
  { title: 'Who qualifies', note: 'Service incentives (everything but sales and auto-pay) need this many completed jobs.', fields: [
    ['min_served', 'Completed jobs needed per month', 'jobs'],
  ] },
  { key: 'sales', title: 'Sales', note: 'Paid for each sale whose first service is done. Not prorated.', fields: [
    ['sale_amt', 'Each sale pays', '$'],
  ] },
  { key: 'autopay', title: 'Auto-pay', note: 'Paid for each customer the tech puts on auto-pay. Not prorated.', fields: [
    ['autopay_amt', 'Each auto-pay added pays', '$'],
  ] },
  { key: 'completed', title: 'Completed jobs', fields: [
    ['completed_min', 'At or above this many completed jobs a month', 'jobs'], ['completed_amt', 'Pays', '$'],
  ] },
  { key: 'completion', title: 'Completion', fields: [
    ['comp_hi', 'Top tier at or above', '%'], ['comp_hi_amt', 'Top tier pays', '$'],
    ['comp_lo', 'Second tier at or above', '%'], ['comp_lo_amt', 'Second tier pays', '$'],
  ] },
  { key: 'reservice', title: 'Reservice rate', note: 'Reservices and incompletes ÷ completed jobs. Weather partials never count.', fields: [
    ['resv_max', 'At or below this reservice rate', '%'], ['resv_amt', 'Pays', '$'],
  ] },
  { key: 'reviews', title: 'Reviews', fields: [
    ['star_amt', 'Each top review pays', '$'], ['star_min', 'Stars that count as a top review', 'stars'],
  ] },
  { key: 'safety', title: 'Safety (driving score)', fields: [
    ['drive_hi', 'Top tier at or above', 'score'], ['drive_hi_amt', 'Top tier pays', '$'],
    ['drive_lo', 'Second tier at or above', 'score'], ['drive_lo_amt', 'Second tier pays', '$'],
    ['distracted_max', 'Most distracted-driving events allowed for the safety bonus', 'events'],
  ] },
  { key: 'cancels', title: 'Cancels (penalty)', fields: [
    ['cancel_tech_penalty', 'Taken off per cancel the tech caused', '$'],
  ] },
  { title: 'Driving cutoff', note: 'A driving score below the cutoff disqualifies the tech from bonuses for that period. 0 = off.', fields: [
    ['drive_gate', 'Cutoff score', 'score'],
  ], keepSales: true },
];

// Fields added 2026-11-18 start with these values until saved.
const DEFAULTS = { autopay_amt: 0, completed_min: 0, completed_amt: 0, resv_max: 3, resv_amt: 0, sale_amt: 100 };

const num = (v) => Number(v || 0);

export default function RulesEditor({ initial, myId, reasons = [] }) {
  const router = useRouter();
  const [rules, setRules] = useState(() => {
    const r = { ...DEFAULTS, ...initial };
    GROUPS.forEach((g) => { if (g.key) r[`on_${g.key}`] = incentiveOn(initial, g.key); });
    r.drive_gate_keep_sales = initial.drive_gate_keep_sales !== false;
    return r;
  });
  const [tech, setTech] = useState(Array.isArray(initial.cancel_tech_reasons) ? initial.cancel_tech_reasons : []);
  const [billing, setBilling] = useState(Array.isArray(initial.cancel_billing_reasons) ? initial.cancel_billing_reasons : []);
  const [added, setAdded] = useState('');
  const [extra, setExtra] = useState([]);
  // Every reason: the ones FieldRoutes used this quarter and last (with counts), the saved ones, and any typed in.
  const counts = Object.fromEntries(reasons.map((r) => [r.reason, r.n]));
  const allReasons = [...new Set([...reasons.map((r) => r.reason), ...tech, ...billing, ...extra])]
    .filter((r) => r && r !== 'Not specified')
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b));
  const flip = (list, setList, r, on) => setList(on ? [...new Set([...list, r])] : list.filter((x) => x !== r));
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setRules((r) => ({ ...r, [k]: v }));

  async function save(e) {
    e.preventDefault();
    const clean = { ...rules };
    for (const g of GROUPS) for (const [k, label] of g.fields) {
      const n = Number(rules[k]);
      if (rules[k] === '' || !Number.isFinite(n) || n < 0) { setMsg({ text: `“${label}” needs a number of 0 or more.`, bad: true }); return; }
      clean[k] = n;
    }
    clean.cancel_tech_reasons = tech;
    clean.cancel_billing_reasons = billing;
    setSaving(true);
    setMsg({ text: '', bad: false });
    const { data, error } = await createClient().from('scorecard_rules')
      .update({ rules: clean, updated_by: myId, updated_at: new Date().toISOString() }).eq('id', 1).select('id');
    setSaving(false);
    if (error) { setMsg({ text: error.message, bad: true }); return; }
    if (!data?.length) { setMsg({ text: 'Not saved: only C-Suite and the President can change the rules.', bad: true }); return; }
    setMsg({ text: 'Rules saved. The performance card uses them right away.', bad: false });
    router.refresh();
  }

  return (
    <form className="editor rules" onSubmit={save}>
      <section className="panel">
        <label className="toggle">
          <input type="checkbox" checked={!!rules.bonuses_on} onChange={(e) => set('bonuses_on', e.target.checked)} />
          <span className="toggle-track" aria-hidden="true" />
          Show bonus amounts on the performance card
        </label>
        <p className="note">While this is off, techs see their numbers but no dollar amounts.</p>
      </section>

      {GROUPS.map((g) => (
        <section className={`panel${g.key && !rules[`on_${g.key}`] ? ' rule-off' : ''}`} key={g.title}>
          {g.key
            ? <Toggle checked={!!rules[`on_${g.key}`]} onChange={(v) => set(`on_${g.key}`, v)}><h2 className="rule-h">{g.title}</h2></Toggle>
            : <h2>{g.title}</h2>}
          {g.note && <p className="note">{g.note}</p>}
          {(!g.key || rules[`on_${g.key}`]) && <div className="rule-fields">
            {g.fields.map(([k, label, unit]) => (
              <div key={k} className="rule-field">
                <label htmlFor={k}>{label}</label>
                <div className="with-unit">
                  {unit === '$' && <span className="unit">$</span>}
                  <input id={k} type="number" inputMode="decimal" min="0" step="any" value={rules[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                  {unit !== '$' && <span className="unit">{unit}</span>}
                </div>
              </div>
            ))}
          </div>}
          {g.keepSales && num(rules.drive_gate) > 0 && (
            <Toggle checked={rules.drive_gate_keep_sales !== false} onChange={(v) => set('drive_gate_keep_sales', v)}>
              Sales bonuses still pay below the cutoff (everything else is held)
            </Toggle>
          )}
        </section>
      ))}

      <section className="panel">
        <h2>Cancel reasons</h2>
        <p className="note">Switch on the FieldRoutes cancel reasons that count. Any reason left off never counts against a tech. (Counts are this quarter and last.) Click Save rules when done.</p>
        <h3>Caused by the tech</h3>
        <ul className="bn-sources">
          {allReasons.map((r) => (
            <li key={`t-${r}`}><Toggle checked={tech.includes(r)} onChange={(on) => flip(tech, setTech, r, on)}>{r} {counts[r] ? <small className="note">({counts[r]})</small> : null}</Toggle></li>
          ))}
        </ul>
        <h3 className="spaced">Billing (shown, never counted)</h3>
        <ul className="bn-sources">
          {allReasons.map((r) => (
            <li key={`b-${r}`}><Toggle checked={billing.includes(r)} onChange={(on) => flip(billing, setBilling, r, on)}>{r} {counts[r] ? <small className="note">({counts[r]})</small> : null}</Toggle></li>
          ))}
        </ul>
        <div className="calc-row spaced">
          <input value={added} onChange={(e) => setAdded(e.target.value)} placeholder="Reason not listed? Type it exactly as in FieldRoutes" aria-label="Add a reason" style={{ flex: '1 1 260px' }} />
          <button type="button" className="btn btn-small btn-quiet" disabled={!added.trim()} onClick={() => { setExtra([...extra, added.trim()]); setAdded(''); }}>Add reason</button>
        </div>
      </section>

      {msg.text && <p className={msg.bad ? 'error' : 'ok'} role="status">{msg.text}</p>}
      <div className="panel-buttons">
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save rules'}</button>
      </div>
    </form>
  );
}
