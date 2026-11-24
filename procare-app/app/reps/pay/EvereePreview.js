'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addDays, money, nice, niceY } from '@/lib/comp';
import { OFFICE_NAME } from '@/lib/labels';
import Toggle from '../../Toggle';
import Bug, { BugTile } from '../../Bug';

const href = (payday) => `?tab=everee&payday=${payday}`;
const WHERE = { sandbox: 'Everee’s test company (sandbox)', production: 'your real Everee payroll', unknown: 'Everee' };
const when = (t) => (t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** Where a rep's up front stands for this payday: preview, sent (pending in Everee), payout requested, or changed since sent. */
function stateOf(r, sent) {
  const s = r.payable ? sent[r.payable.externalId] : null;
  if (!r.payable) return r.amount > 0 ? 'nomatch' : 'none';
  if (!s || s.status === 'error') return s?.status === 'error' ? 'error' : 'ready';
  if (Number(s.amount) !== Number(r.amount)) return s.status === 'payout_requested' ? 'changed_paid' : 'changed';
  return s.status === 'payout_requested' ? 'requested' : 'sent';
}
const CHIP = {
  none: ['Nothing owed', ''], nomatch: ['Needs a match', 'ev-bad'], ready: ['Not sent', ''], error: ['Send failed', 'ev-bad'],
  sent: ['Sent · pending', 'ev-ok'], changed: ['Changed since sent', 'ev-warn'], requested: ['Payout requested', 'ev-done'],
  changed_paid: ['Changed after payout', 'ev-bad'],
};

/**
 * Sales → Pay → Everee (change 91). Sales reps are 1099 contractors, so it's two steps, each confirmed here:
 *   1. Send to Everee: each rep's up front becomes a pending item in Everee. Nothing is paid.
 *   2. Request payout: asks Everee to pay the sent items; they're paid once approved in Everee.
 */
export default function EvereePreview({ everee: e }) {
  const router = useRouter();
  const [showSend, setShowSend] = useState(false);
  const [ask, setAsk] = useState(null);       // { action, reps: [rows] } waiting for "Yes"
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);     // last result
  const from = addDays(e.payday, -7), to = addDays(e.payday, -1);
  const sent = e.sent || {};
  const rows = (e.rows || []).map((r) => ({ ...r, state: stateOf(r, sent) }));
  const toSend = rows.filter((r) => ['ready', 'error', 'changed'].includes(r.state));
  const toPay = rows.filter((r) => r.state === 'sent');
  const sum = (list) => list.reduce((t, r) => t + r.amount, 0);
  const canSend = e.configured && !e.error && !e.logMissing;

  const go = async () => {
    setBusy(true); setDone(null);
    try {
      const res = await fetch('/api/everee/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: ask.action, payday: e.payday, reps: ask.reps.map((r) => r.id) }),
      });
      const j = await res.json().catch(() => ({}));
      setDone(res.ok ? j : { error: j.error || `Something went wrong (${res.status}).` });
    } catch {
      setDone({ error: 'Couldn’t reach the app. Check your signal; nothing was sent unless it shows below after a refresh.' });
    }
    setBusy(false); setAsk(null);
    router.refresh();
  };

  return (
    <>
      <p className="pay-shadow">
        <Bug kind="spider" size={22} color="var(--forest)" />
        <strong>Two steps, both yours.</strong> <em>Send to Everee</em> puts each rep’s up front in {WHERE[e.env] || 'Everee'} as a pending
        item; nothing is paid. <em>Request payout</em> asks Everee to pay them (sales reps are 1099 contractors); they’re paid once approved in Everee.
      </p>

      <div className="rc-controls">
        <div className="rc-step">
          <Link className="rc-arrow" href={href(addDays(e.payday, -7))} aria-label="Earlier Monday" scroll={false}>‹</Link>
          <span className="rc-range">Payday {niceY(e.payday)}</span>
          <Link className="rc-arrow" href={href(addDays(e.payday, 7))} aria-label="Later Monday" scroll={false}>›</Link>
        </div>
        {e.payday !== e.next && <Link className="btn btn-quiet btn-small" href={href(e.next)} scroll={false}>Next Monday</Link>}
      </div>

      {!e.configured && <p className="error">The Everee keys aren’t in Vercel yet (EVEREE_API_TOKEN and EVEREE_TENANT_ID).</p>}
      {e.error && <p className="error">Everee couldn’t load: {e.error}</p>}
      {e.logMissing && <p className="note">Sending turns on once database change 91 is run in Supabase (it records every send). Until then this is a preview.</p>}

      {done && (done.error
        ? <p className="error" role="status">{done.error}</p>
        : (
          <div className="ev-result" role="status">
            <strong>{done.action === 'payout' ? 'Payout request' : 'Send'} finished:</strong>{' '}
            {done.results.filter((x) => x.ok).length} of {done.results.length} went through
            {done.results.some((x) => x.ok) && <> ({money(done.results.filter((x) => x.ok).reduce((t, x) => t + x.amount, 0))})</>}.
            {done.results.filter((x) => !x.ok).map((x) => <span key={x.id} className="ev-miss"> {x.name}: {x.message}</span>)}
          </div>
        ))}

      {e.rows && (
        <>
          <div className="rc-tiles">
            <div className="rc-tile"><span className="rc-label">Up fronts this payday</span><span className="rc-tile-val">{money(e.total)}</span><span className="rc-tile-sub">sales serviced {nice(from)}–{nice(to)}</span></div>
            <div className="rc-tile"><span className="rc-label">Not sent yet</span><span className="rc-tile-val">{toSend.length}</span><span className="rc-tile-sub">{money(sum(toSend))}</span></div>
            <div className="rc-tile"><span className="rc-label">Sent, waiting for payout</span><span className="rc-tile-val">{toPay.length}</span><span className="rc-tile-sub">{money(sum(toPay))}</span></div>
            <div className="rc-tile"><span className="rc-label">Need a match</span><span className="rc-tile-val">{e.blocked}</span><span className="rc-tile-sub">{e.blocked ? 'owed pay but not found in Everee' : 'everyone owed is matched'}</span></div>
          </div>

          {canSend && (
            <div className="ev-actions">
              <button type="button" className="btn" disabled={busy || !toSend.length} onClick={() => setAsk({ action: 'send', reps: toSend })}>
                Send {toSend.length || ''} to Everee{toSend.length ? ` · ${money(sum(toSend))}` : ''}
              </button>
              <button type="button" className="btn btn-quiet" disabled={busy || !toPay.length} onClick={() => setAsk({ action: 'payout', reps: toPay })}>
                Request payout{toPay.length ? ` · ${toPay.length} · ${money(sum(toPay))}` : ''}
              </button>
            </div>
          )}

          {ask && (
            <div className="ev-confirm" role="alertdialog" aria-label="Confirm">
              <p><strong>{ask.action === 'send'
                ? `Send ${ask.reps.length} up front${ask.reps.length === 1 ? '' : 's'} (${money(sum(ask.reps))}) to ${WHERE[e.env] || 'Everee'}?`
                : `Ask Everee to pay ${ask.reps.length} rep${ask.reps.length === 1 ? '' : 's'} ${money(sum(ask.reps))}?`}</strong></p>
              <p className="calc-hint">{ask.action === 'send'
                ? 'They show up in Everee as pending items. Nothing is paid, and you can still change them by sending again.'
                : 'This asks Everee to pay these contractors. They’re paid once approved in Everee (or right away if Everee is set to approve automatically). It can’t be undone from here.'}</p>
              <ul className="ev-confirm-list">{ask.reps.map((r) => <li key={r.id}><span>{r.name}</span><strong>{money(r.amount)}</strong></li>)}</ul>
              <div className="ev-actions">
                <button type="button" className="btn" disabled={busy} onClick={go}>{busy ? 'Working…' : ask.action === 'send' ? 'Yes, send to Everee' : 'Yes, request payout'}</button>
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setAsk(null)}>Cancel</button>
              </div>
            </div>
          )}

          <section className="rc-panel">
            <div className="rc-panel-body">
              <h2 className="cp-h"><BugTile kind="ant" tone="forest" size={30} /> Each rep</h2>
              <p className="calc-hint">The same numbers as each rep’s Statement → Weekly up fronts. Matched to Everee by email, then by first and last name. Quarter checks aren’t included yet. To send just one rep (like a first test), use their Send button.</p>
              <div className="ev-table">
                <table>
                  <thead><tr><th>Rep</th><th>Sales</th><th>Up front</th><th>Everee worker</th><th>Status</th><th><span className="sr-only">Send</span></th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const s = r.payable ? sent[r.payable.externalId] : null;
                      const [label, cls] = CHIP[r.state];
                      return (
                        <tr key={r.id}>
                          <td><strong>{r.name}</strong><small>{OFFICE_NAME[r.office] || ''}{r.active ? '' : ' · left'}</small></td>
                          <td>{r.sales}</td>
                          <td>{money(r.amount)}{s && Number(s.amount) !== Number(r.amount) && <small>sent {money(s.amount)}</small>}</td>
                          <td>{r.worker
                            ? <>{r.worker.name}<small>{r.worker.email || 'no email'} · matched by {r.matchedBy}</small></>
                            : <span className="ev-miss">{r.matchedBy === 'several' ? 'More than one with that name' : 'Not found'}<small>{r.email ? `app email ${r.email}` : 'no email in the app'}</small></span>}
                          </td>
                          <td><span className={`ev-chip ${cls}`}>{label}</span>
                            {s && <small>{s.status === 'payout_requested' ? `requested ${when(s.payout_requested_at)}` : `sent ${when(s.sent_at)}`}{s.message ? ` · ${s.message}` : ''}</small>}
                          </td>
                          <td>{canSend && ['ready', 'error', 'changed'].includes(r.state) && (
                            <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => setAsk({ action: 'send', reps: [r] })}>Send</button>
                          )}{canSend && r.state === 'sent' && (
                            <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => setAsk({ action: 'payout', reps: [r] })}>Pay out</button>
                          )}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Toggle small checked={showSend} onChange={setShowSend}>Show exactly what would be sent</Toggle>
              {showSend && (
                <pre className="ev-json">{JSON.stringify(rows.filter((r) => r.payable).map((r) => r.payable), null, 2) || '[]'}</pre>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
