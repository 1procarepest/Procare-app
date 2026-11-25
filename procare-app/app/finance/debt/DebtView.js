'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { KINDS } from '@/lib/debt';
import { dollars, usDate } from '@/lib/trucks';
import Picker from '../../Picker';
import Toggle from '../../Toggle';
import OpsHero from '../../ops/OpsHero';

const rpc = (name, args) => createClient().rpc(name, args);
const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);
const monthName = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '');

function Msg({ m }) {
  if (!m) return null;
  return <p className={m.ok ? 'ok' : 'error'} role="status">{m.text}</p>;
}

/** The QuickBooks account a loan's balance comes from. */
function AccountLink({ it, accounts, onError }) {
  const router = useRouter();
  const options = [{ value: '', label: 'Not linked (use the typed balance)' },
    ...accounts.map((a) => ({ value: a.id, label: a.parent ? `${a.parent}: ${a.name}` : a.name, sub: dollars(a.amount, true) }))];
  const pick = async (id) => {
    const a = accounts.find((x) => x.id === id);
    const { error } = await rpc('link_debt_account', { p_kind: it.type, p_id: it.id, p_account_id: id || null, p_account_name: a ? a.name : null });
    if (error) onError(error.message); else router.refresh();
  };
  return <Picker label="QuickBooks account" value={it.qbo_account_id || ''} options={options} placeholder="Link to QuickBooks…" onChange={pick} />;
}

/* ---------- Add / edit a loan, card or line (not truck loans: those are on the truck) ---------- */
const FIELDS = [['name', 'Name', 'text'], ['lender', 'Lender', 'text'], ['payment', 'Monthly payment ($)', 'decimal'], ['rate', 'Interest (%)', 'decimal'],
  ['rate_note', 'Rate note', 'text'], ['start_on', 'Start', 'date'], ['end_on', 'End', 'date'], ['original', 'Original amount ($)', 'decimal'],
  ['credit_limit', 'Credit limit ($)', 'decimal'], ['balance', 'Balance ($, if not linked)', 'decimal']];

function DebtForm({ debt, onDone }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({ kind: debt?.kind || 'long', purpose: debt?.purpose || '', ...Object.fromEntries(FIELDS.map(([k]) => [k, debt?.[k] ?? ''])) }));
  const [m, setM] = useState(null);
  const save = async (del = false) => {
    if (del && !window.confirm(`Delete ${debt.name} from the schedule?`)) return;
    const p = { ...f, active: true };
    for (const [k, , t] of FIELDS) if (t === 'decimal') p[k] = String(p[k] ?? '').replace(/[$,%\s]/g, '');
    if (!del && !String(p.name).trim()) { setM({ ok: false, text: 'Give it a name.' }); return; }
    const { error } = await rpc('save_debt', { p_id: debt?.id || null, p, p_delete: del });
    if (error) { setM({ ok: false, text: error.message }); return; }
    onDone(); router.refresh();
  };
  return (
    <div className="tr-sec">
      <div className="chips">
        {KINDS.filter((k) => k.key !== 'auto').map((k) => <button key={k.key} type="button" className={`chip${f.kind === k.key ? ' on' : ''}`} onClick={() => setF({ ...f, kind: k.key })}>{k.label}</button>)}
      </div>
      <div className="tr-grid">
        {FIELDS.map(([k, label, t]) => (
          <label key={k} className="tr-field"><span>{label}</span>
            <input type={t === 'date' ? 'date' : 'text'} inputMode={t === 'decimal' ? 'decimal' : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
        <label className="tr-field tr-wide"><span>What it was for</span><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></label>
      </div>
      <p className="note">No account or loan numbers here.</p>
      <div className="panel-buttons">
        <button type="button" className="btn btn-small" onClick={() => save(false)}>Save</button>
        {debt && <button type="button" className="btn btn-small btn-quiet" onClick={() => save(true)}>Delete</button>}
        <button type="button" className="btn btn-small btn-quiet" onClick={onDone}>Cancel</button>
      </div>
      <Msg m={m} />
    </div>
  );
}

export default function DebtView({ d, connection, today }) {
  const router = useRouter();
  const [m, setM] = useState(null);
  const [edit, setEdit] = useState(null);   // debt id or 'new'
  const [showLinks, setShowLinks] = useState(!d.items.some((i) => i.qbo_account_id));
  const [busy, setBusy] = useState(false);
  const suggestions = d.items.filter((i) => i.suggested);
  const p = d.profit;

  const linkAll = async () => {
    setBusy(true);
    for (const it of suggestions) {
      const { error } = await rpc('link_debt_account', { p_kind: it.type, p_id: it.id, p_account_id: it.suggested.id, p_account_name: it.suggested.name });
      if (error) { setM({ ok: false, text: error.message }); break; }
    }
    setBusy(false);
    router.refresh();
  };
  const syncNow = async () => {
    setBusy(true); setM(null);
    const res = await fetch('/api/qbo/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ months: 3 }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setM(j.ok && !j.bsError ? { ok: true, text: `Copied the balance sheet (${j.bsLines} lines).` } : { ok: false, text: j.bsError || j.error || `Error ${res.status}` });
    router.refresh();
  };

  return (
    <>
      <OpsHero kicker="Finance" title="Debt" em="schedule" bug="roach">
        {d.bsMonth ? `Balances from QuickBooks as of ${monthName(d.bsMonth)}${d.bsMonth.slice(0, 7) === today.slice(0, 7) ? ' (so far)' : ''}` : 'No QuickBooks balance sheet yet'}
        {' · '}<button type="button" className="linklike" disabled={busy} onClick={syncNow}>{busy ? 'Copying…' : 'Sync now'}</button>
      </OpsHero>
      {connection.bs_sync_error && <p className="error">The last balance sheet copy had a problem: {connection.bs_sync_error}</p>}

      <div className="fin-tiles">
        <div className="fin-tile"><span className="note">Debt payments a month</span><strong>{dollars(d.total.payment)}</strong>
          <small className="note">{dollars(d.total.payment * 12)} a year</small></div>
        <div className="fin-tile"><span className="note">Total owed</span><strong>{dollars(d.total.balance)}</strong>
          <small className="note">{d.qboTotal !== null ? `QuickBooks shows ${dollars(d.qboTotal)} in loans and cards` : 'From the schedule'}</small></div>
        <div className="fin-tile"><span className="note">Net profit a month</span><strong>{p.avgNet === null ? '–' : dollars(p.avgNet)}</strong>
          <small className="note">{p.months ? `Average of the last ${p.months} months${p.avgInterest ? ` · interest ${dollars(p.avgInterest)} a month is already in it` : ''}` : 'Needs the P&L from QuickBooks'}</small></div>
        <div className="fin-tile"><span className="note">Debt payments vs. profit</span><strong>{pct(p.share)}</strong>
          <small className="note">{p.last ? `${monthName(p.last.month)}: ${dollars(p.last.net)} profit, payments ${pct(p.lastShare)} of it` : 'Of net profit, each month'}</small></div>
      </div>
      <p className="note fin-explain">Debt payments are principal and interest together. Interest is already an expense on the P&amp;L, so this is how much of the bottom line, plus the interest, goes out the door for debt each month.</p>

      <div className="tr-controls">
        <Toggle checked={showLinks} onChange={setShowLinks} small><span>Show QuickBooks links</span></Toggle>
        {suggestions.length > 0 && <button type="button" className="btn btn-small" disabled={busy} onClick={linkAll}>Link {suggestions.length} I could match</button>}
        <button type="button" className="btn btn-small btn-quiet" onClick={() => setEdit('new')}>Add a loan or card</button>
      </div>
      <Msg m={m} />
      {edit === 'new' && <DebtForm onDone={() => setEdit(null)} />}

      <div className="tr-scroll">
        <table className="ops-table tr-table debt-table">
          <thead>
            <tr><th>Loan</th><th>Lender</th><th>Payment</th><th>Rate</th><th>Ends</th><th>Owed</th>{showLinks && <th>QuickBooks account</th>}</tr>
          </thead>
          <tbody>
            {d.groups.map((g) => (
              <Fragment key={g.key}>
                <tr className="fin-sum"><th>{g.label} <span className="note">({g.list.length})</span>{g.wildlife && <span className="tr-vin">Wildlife: {g.wildlife.count} trucks, {dollars(g.wildlife.payment)} a month, {dollars(g.wildlife.balance)} owed</span>}</th><td /><td>{dollars(g.payment)}</td><td /><td />
                  <td>{dollars(g.balance)}{g.limit ? <span className="tr-vin">of {dollars(g.limit)} limit</span> : null}</td>{showLinks && <td />}</tr>
                {g.list.map((it) => (
                  <Fragment key={it.id}>
                    <tr>
                      <th scope="row">
                        {it.type === 'debt' ? <button type="button" className="linklike" onClick={() => setEdit(edit === it.id ? null : it.id)}>{it.name}</button> : it.name}
                        {it.for_sale && <span className="pill tr-st-for_sale">For sale</span>}
                        {it.wildlife && <span className="pill">Wildlife</span>}
                        {it.purpose && <span className="tr-vin">{it.purpose}</span>}
                      </th>
                      <td>{it.lender || '—'}</td>
                      <td>{it.payment ? dollars(it.payment, true) : '—'}</td>
                      <td>{it.rate !== null && it.rate !== undefined ? `${Number(it.rate)}%` : it.rate_note || '—'}</td>
                      <td>{it.end_on ? usDate(it.end_on) : '—'}{it.left !== null ? <span className="tr-vin">{it.left} months left</span> : null}</td>
                      <td>{dollars(it.balance)}<span className="tr-vin">{it.source === 'qbo' ? 'QuickBooks' : it.source === 'typed' ? 'typed in' : ''}</span></td>
                      {showLinks && (
                        <td className="debt-link">
                          {d.bsMonth ? <AccountLink it={it} accounts={d.accounts} onError={(t) => setM({ ok: false, text: t })} /> : <span className="note">After the first sync</span>}
                          {it.suggested && <span className="tr-vin">Match: {it.suggested.name}</span>}
                        </td>
                      )}
                    </tr>
                    {edit === it.id && <tr className="tr-open"><td colSpan={showLinks ? 7 : 6}><DebtForm debt={it} onDone={() => setEdit(null)} /></td></tr>}
                  </Fragment>
                ))}
              </Fragment>
            ))}
            <tr className="fin-sum fin-net"><th>Total</th><td /><td>{dollars(d.total.payment)}</td><td /><td /><td>{dollars(d.total.balance)}</td>{showLinks && <td />}</tr>
          </tbody>
        </table>
      </div>
      <p className="note">Truck loans are changed on the truck (Operations → Trucks). Paid-off loans and sold trucks drop off.</p>

      {d.unlinked.length > 0 && (
        <section className="panel debt-unlinked">
          <h2 className="fin-h2">In QuickBooks, not on the schedule</h2>
          <p className="note">Loan and credit card accounts with a balance that no loan above is linked to. Link them above, or add them as a loan or card.</p>
          <table className="ops-table">
            <tbody>
              {d.unlinked.map((a) => <tr key={a.id}><th>{a.parent ? `${a.parent}: ${a.name}` : a.name}</th><td>{a.grp === 'CreditCards' ? 'Credit card' : a.grp === 'LongTermLiabilities' ? 'Long term' : 'Current'}</td><td>{dollars(a.amount, true)}</td></tr>)}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
