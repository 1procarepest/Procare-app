'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { shortDate } from '@/lib/labels';
import { money0 } from '@/lib/ops';
import { payPeriod, shiftPeriod } from '@/lib/payroll';
import { BASIS_LABEL, LINE_LABEL } from '@/lib/wildlifePay';
import { CritterTile } from '../../Critter';

const money2 = (x) => `$${(Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const range = (a, b) => `${shortDate(a)} – ${shortDate(b)}`;
const CRITTER = { exclusion: ['squirrel', 'forest'], insulation: ['mice', 'lime'], trapping: ['raccoon', 'sage'] };

/** C-Suite, the President and the HR approver set each person's plan. */
function PlanEditor({ person, onDone }) {
  const router = useRouter();
  const [f, setF] = useState({ ...person.plan });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF((c) => ({ ...c, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const row = {
      employee_id: person.id, plan: f.plan, sell_pct: Number(f.sell_pct) || 0, work_pct: Number(f.work_pct) || 0,
      salary: Number(f.salary) || 0, job_bonus: Number(f.job_bonus) || 0, updated_at: new Date().toISOString(),
    };
    const { error } = await createClient().from('wildlife_pay_plans').upsert(row);
    setBusy(false);
    if (error) { setMsg(`Couldn’t save: ${error.message}`); return; }
    router.refresh();
    onDone();
  }

  return (
    <form className="wp-plan-form" onSubmit={save}>
      <div className="rc-seg" role="group" aria-label="Pay plan">
        {[['commission', 'Full commission'], ['salary', 'Salary + job bonus']].map(([k, label]) => (
          <button key={k} type="button" className={f.plan === k ? 'on' : ''} aria-pressed={f.plan === k} onClick={() => setF((c) => ({ ...c, plan: k }))}>{label}</button>
        ))}
      </div>
      {f.plan === 'commission' ? (
        <div className="wp-fields">
          <div><label htmlFor={`sp-${person.id}`}>Selling the job (%)</label><input id={`sp-${person.id}`} type="number" min="0" max="100" step="0.5" value={f.sell_pct} onChange={set('sell_pct')} /></div>
          <div><label htmlFor={`wp-${person.id}`}>Doing the work (%)</label><input id={`wp-${person.id}`} type="number" min="0" max="100" step="0.5" value={f.work_pct} onChange={set('work_pct')} /></div>
        </div>
      ) : (
        <div className="wp-fields">
          <div><label htmlFor={`sa-${person.id}`}>Salary per pay period ($)</label><input id={`sa-${person.id}`} type="number" min="0" step="1" value={f.salary} onChange={set('salary')} /></div>
          <div><label htmlFor={`jb-${person.id}`}>Bonus per job done ($)</label><input id={`jb-${person.id}`} type="number" min="0" step="1" value={f.job_bonus} onChange={set('job_bonus')} /></div>
        </div>
      )}
      <div className="panel-buttons">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save plan'}</button>
        <button className="btn btn-quiet" type="button" onClick={onDone}>Cancel</button>
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
    </form>
  );
}

function planLine(plan) {
  return plan.plan === 'salary'
    ? `Salary ${money0(plan.salary)} per pay period + ${money0(plan.job_bonus)} per job done`
    : `Commission: ${Number(plan.sell_pct)}% for selling, ${Number(plan.work_pct)}% for doing the work`;
}

function PersonPay({ p, canEdit }) {
  const [editing, setEditing] = useState(false);
  return (
    <article className="wp-person">
      <header>
        <div>
          <h2>{p.name}</h2>
          <p className="note">{planLine(p.plan)}{p.plan.saved ? '' : ' (default)'}</p>
        </div>
        <div className="wp-total"><span className="rc-label">This pay period</span><strong>{money2(p.total)}</strong></div>
        {canEdit && !editing && <button type="button" className="link" onClick={() => setEditing(true)}>Change plan</button>}
      </header>
      {editing && <PlanEditor person={p} onDone={() => setEditing(false)} />}
      <p className="wp-sum">
        {p.plan.plan === 'salary'
          ? <>Salary {money2(p.salary)} · job bonuses {money2(p.bonus)}</>
          : <>Selling {money2(p.sell)} · doing the work {money2(p.work)}</>}
      </p>
      {p.lines.length === 0 ? <p className="note">No wildlife jobs had their first visit done this pay period.</p> : (
        <div className="pay-scroll">
          <table className="ops-table wp-table">
            <thead>
              <tr>
                <th scope="col">Customer</th><th scope="col">Job</th><th scope="col">First visit done</th><th scope="col">Paid on</th>
                <th scope="col">Sold</th><th scope="col">Did the work</th><th scope="col">Pay</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.id}>
                  <th scope="row">{[l.first, l.cust].filter(Boolean).join(' ') || 'Customer'}</th>
                  <td className="wp-job"><CritterTile kind={CRITTER[l.line]?.[0]} tone={CRITTER[l.line]?.[1]} size={24} /> {LINE_LABEL[l.line]}<small>{l.service_type}</small></td>
                  <td>{shortDate(l.done_on)}</td>
                  <td>{money2(l.basis)}<small>{BASIS_LABEL[l.line]}</small></td>
                  <td>{l.sold ? (p.plan.plan === 'commission' ? money2(l.sell) : '✓') : '–'}</td>
                  <td>{l.did ? (p.plan.plan === 'commission' ? money2(l.work) : money2(l.bonus)) : '–'}</td>
                  <td><b>{money2(l.pay)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export default function WildlifePayView({ people, referrals, period, today, canEdit, everyone }) {
  const thisPeriod = payPeriod(today);
  const prev = shiftPeriod(period.from, -1);
  const next = shiftPeriod(period.from, 1);
  return (
    <>
      <div className="rc-top brand-head brand-hero wl-head">
        <div>
          <p className="rc-kicker">Wildlife · Pay</p>
          <h1 className="rc-title">Wildlife <em>pay</em></h1>
          <p className="note">Earned the day a job’s first visit is done. Exclusion and Insulation pay on the initial job only; Trapping on the entire job. Warranties and reservices don’t pay.</p>
        </div>
        <div className="wl-tiles" aria-hidden="true">
          <CritterTile kind="squirrel" tone="forest" size={46} /><CritterTile kind="mice" tone="lime" size={46} /><CritterTile kind="raccoon" tone="sage" size={46} />
        </div>
      </div>

      <div className="rc-step wp-step">
        <Link className="rc-arrow" href={`/wildlife/pay?from=${prev.from}`} aria-label="Previous pay period" scroll={false}>‹</Link>
        <span className="rc-range">{range(period.from, period.to)}{period.from === thisPeriod.from ? ' (this pay period)' : ''}</span>
        <Link className="rc-arrow" href={`/wildlife/pay?from=${next.from}`} aria-label="Next pay period" scroll={false}>›</Link>
        {period.from !== thisPeriod.from && <Link className="ops-today" href="/wildlife/pay" scroll={false}>This period</Link>}
      </div>

      {people.length === 0 && <p className="note">Nobody is in the Wildlife department yet.</p>}
      {people.map((p) => <PersonPay key={p.id} p={p} canEdit={canEdit} />)}

      {everyone && (
        <section className="wp-referrals" aria-labelledby="wp-ref-h">
          <h2 id="wp-ref-h">Referrals to pay · {money0(referrals.amount)} each</h2>
          <p className="note">Techs and sales reps who are Sales Rep 2 on a wildlife job whose first visit was done this pay period.</p>
          {referrals.list.length === 0 ? <p className="note">None this pay period.</p> : (
            <ul className="wp-ref-list">
              {referrals.list.map((r) => (
                <li key={r.id}>
                  <b>{r.name}</b> · {r.jobs.length} referral{r.jobs.length === 1 ? '' : 's'} · <b>{money0(r.total)}</b>
                  <small>{r.jobs.map((j) => `${[j.first, j.cust].filter(Boolean).join(' ')} (${LINE_LABEL[j.line]}, ${shortDate(j.done_on)})`).join(' · ')}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
