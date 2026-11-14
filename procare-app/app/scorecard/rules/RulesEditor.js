'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const GROUPS = [
  { title: 'Who qualifies', fields: [
    ['min_served', 'Completed jobs needed per month', 'jobs'],
  ] },
  { title: 'Completion', fields: [
    ['comp_hi', 'Top tier at or above', '%'], ['comp_hi_amt', 'Top tier pays', '$'],
    ['comp_lo', 'Second tier at or above', '%'], ['comp_lo_amt', 'Second tier pays', '$'],
  ] },
  { title: 'Production', fields: [
    ['prod_floor', 'Production before the bonus starts', '$'], ['prod_pct', 'Bonus on production above that', '%'],
  ] },
  { title: 'Reviews and sales', fields: [
    ['star_amt', 'Each top review pays', '$'], ['star_min', 'Stars that count as a top review', 'stars'],
    ['sale_amt', 'Each sale whose first service is done pays', '$'],
  ] },
  { title: 'Driving', note: 'Leave the amounts at 0 for no driving bonus.', fields: [
    ['drive_hi', 'Top tier at or above', 'score'], ['drive_hi_amt', 'Top tier pays', '$'],
    ['drive_lo', 'Second tier at or above', 'score'], ['drive_lo_amt', 'Second tier pays', '$'],
    ['distracted_max', 'Most distracted-driving events allowed for the driving bonus', 'events'],
    ['drive_gate', 'Driving cutoff: below this score, no bonuses at all (0 = off)', 'score'],
  ] },
  { title: 'Cancels', fields: [
    ['cancel_tech_penalty', 'Taken off per cancel the tech caused', '$'],
  ] },
];

const lines = (v) => (Array.isArray(v) ? v.join('\n') : '');

export default function RulesEditor({ initial, myId }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [tech, setTech] = useState(lines(initial.cancel_tech_reasons));
  const [billing, setBilling] = useState(lines(initial.cancel_billing_reasons));
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
    const list = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    clean.cancel_tech_reasons = list(tech);
    clean.cancel_billing_reasons = list(billing);
    setSaving(true);
    setMsg({ text: '', bad: false });
    const { data, error } = await createClient().from('scorecard_rules')
      .update({ rules: clean, updated_by: myId, updated_at: new Date().toISOString() }).eq('id', 1).select('id');
    setSaving(false);
    if (error) { setMsg({ text: error.message, bad: true }); return; }
    if (!data?.length) { setMsg({ text: 'Not saved: only C-Suite and the President can change the rules.', bad: true }); return; }
    setMsg({ text: 'Rules saved. The scorecard uses them right away.', bad: false });
    router.refresh();
  }

  return (
    <form className="editor rules" onSubmit={save}>
      <section className="panel">
        <label className="toggle">
          <input type="checkbox" checked={!!rules.bonuses_on} onChange={(e) => set('bonuses_on', e.target.checked)} />
          <span className="toggle-track" aria-hidden="true" />
          Show bonus amounts on the scorecard
        </label>
        <p className="note">While this is off, techs see their numbers but no dollar amounts.</p>
      </section>

      {GROUPS.map((g) => (
        <section className="panel" key={g.title}>
          <h2>{g.title}</h2>
          {g.note && <p className="note">{g.note}</p>}
          <div className="rule-fields">
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
          </div>
        </section>
      ))}

      <section className="panel">
        <h2>Cancel reasons</h2>
        <p className="note">One per line, as they’re named in FieldRoutes. Any other reason never counts against a tech.</p>
        <div className="row">
          <div>
            <label htmlFor="cx-tech">Caused by the tech</label>
            <textarea id="cx-tech" rows={6} value={tech} onChange={(e) => setTech(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cx-billing">Billing (shown, never counted)</label>
            <textarea id="cx-billing" rows={6} value={billing} onChange={(e) => setBilling(e.target.value)} />
          </div>
        </div>
      </section>

      {msg.text && <p className={msg.bad ? 'error' : 'ok'} role="status">{msg.text}</p>}
      <div className="panel-buttons">
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save rules'}</button>
      </div>
    </form>
  );
}
