'use client';

import Link from 'next/link';
import { useState } from 'react';
import { addDays, money, nice, niceY } from '@/lib/comp';
import { OFFICE_NAME } from '@/lib/labels';
import Toggle from '../../Toggle';
import Bug, { BugTile } from '../../Bug';

const href = (payday) => `?tab=everee&payday=${payday}`;
const WHERE = { sandbox: 'Everee’s test company (sandbox)', production: 'your real Everee payroll', unknown: 'Everee' };

/** Sales → Pay → Everee: the payables the app would send for one Monday. Preview only: nothing is sent. */
export default function EvereePreview({ everee: e }) {
  const [showSend, setShowSend] = useState(false);
  const from = addDays(e.payday, -7), to = addDays(e.payday, -1);

  return (
    <>
      <p className="pay-shadow">
        <Bug kind="spider" size={22} color="var(--forest)" />
        <strong>Preview only.</strong> This shows what the app would send to {WHERE[e.env] || 'Everee'} for this payday. Nothing is sent, and
        nothing here can pay anyone. When it is switched on later, each item still waits for approval in Everee before it’s paid.
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

      {e.rows && (
        <>
          <div className="rc-tiles">
            <div className="rc-tile"><span className="rc-label">Up fronts this payday</span><span className="rc-tile-val">{money(e.total)}</span><span className="rc-tile-sub">sales serviced {nice(from)}–{nice(to)}</span></div>
            <div className="rc-tile"><span className="rc-label">Ready to send</span><span className="rc-tile-val">{e.ready}</span><span className="rc-tile-sub">matched to an Everee worker</span></div>
            <div className="rc-tile"><span className="rc-label">Need a match</span><span className="rc-tile-val">{e.blocked}</span><span className="rc-tile-sub">{e.blocked ? 'owed pay but not found in Everee' : 'everyone owed is matched'}</span></div>
            <div className="rc-tile"><span className="rc-label">Everee workers</span><span className="rc-tile-val">{e.workerCount}</span><span className="rc-tile-sub">on file in {WHERE[e.env] || 'Everee'}</span></div>
          </div>

          <section className="rc-panel">
            <div className="rc-panel-body">
              <h2 className="cp-h"><BugTile kind="ant" tone="forest" size={30} /> Each rep</h2>
              <p className="calc-hint">The same numbers as each rep’s Statement → Weekly up fronts. Matched to Everee by email, then by first and last name. Quarter checks aren’t included yet.</p>
              <div className="ev-table">
                <table>
                  <thead><tr><th>Rep</th><th>Sales</th><th>Up front</th><th>Everee worker</th><th>Status</th></tr></thead>
                  <tbody>
                    {e.rows.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.name}</strong><small>{OFFICE_NAME[r.office] || ''}{r.active ? '' : ' · left'}</small></td>
                        <td>{r.sales}</td>
                        <td>{money(r.amount)}</td>
                        <td>{r.worker
                          ? <>{r.worker.name}<small>{r.worker.email || 'no email'} · matched by {r.matchedBy}</small></>
                          : <span className="ev-miss">{r.matchedBy === 'several' ? 'More than one with that name' : 'Not found'}<small>{r.email ? `app email ${r.email}` : 'no email in the app'}</small></span>}
                        </td>
                        <td>{r.payable
                          ? <span className="ev-chip ev-ok">Would send</span>
                          : r.amount > 0 ? <span className="ev-chip ev-bad">Needs a match</span>
                            : <span className="ev-chip">Nothing owed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Toggle small checked={showSend} onChange={setShowSend}>Show exactly what would be sent</Toggle>
              {showSend && (
                <pre className="ev-json">{JSON.stringify(e.rows.filter((r) => r.payable).map((r) => r.payable), null, 2) || '[]'}</pre>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
