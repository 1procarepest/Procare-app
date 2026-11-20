'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Bug from './Bug';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

/** Competition prize money and approved quarterly bonuses on the profile: what's waiting, cash out, and past payouts. */
// Balances cleared before payouts went live in the app (supabase/imports/2026-11-20-clear-earnings.sql) were paid
// outside the app, so they don't show here: neither in "paid so far" nor in the list.
const CLEARED = 'Cleared before launch';

/** minimum: cash out needs at least this much waiting (pay_settings.cashout_min, change 70), so HR isn't paying out many small amounts. */
export default function Earnings({ awards: allAwards, requests: allRequests, minimum = 100 }) {
  const clearedIds = new Set(allRequests.filter((r) => (r.note || '').startsWith(CLEARED)).map((r) => r.id));
  const requests = allRequests.filter((r) => !clearedIds.has(r.id));
  const awards = allAwards.filter((a) => !clearedIds.has(a.payout_id));
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const open = awards.filter((a) => !a.payout_id);
  const balance = open.reduce((t, a) => t + Number(a.amount), 0);
  const waiting = requests.filter((r) => r.status === 'requested');
  const paidTotal = requests.filter((r) => r.status === 'paid').reduce((t, r) => t + Number(r.amount), 0);

  const cashOut = async () => {
    setBusy(true);
    setMsg('');
    const { data: id, error } = await sb.rpc('request_payout');
    if (error || !id) { setBusy(false); setMsg(error ? `Couldn’t cash out: ${error.message}` : 'Nothing to cash out.'); return; }
    await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'payout_request', id }) }).catch(() => {});
    setMsg('Sent to payroll. You’ll get an email when it’s paid.');
    setBusy(false);
    router.refresh();
  };

  return (
    <section className="section earn" aria-labelledby="earn-heading">
      <div className="my-card-head">
        <h2 id="earn-heading">Earnings</h2>
        <Link href="/compete">Competitions ›</Link>
      </div>
      <div className="earn-box">
        <Bug kind="stinging" size={110} className="earn-bug" />
        <div className="earn-main">
          <span className="earn-label">Ready to cash out</span>
          <span className="earn-val">{money(balance)}</span>
          <span className="earn-sub">{paidTotal > 0 ? `${money(paidTotal)} paid so far` : 'Prizes, sales and bonuses land here'}</span>
          {balance < minimum && <span className="earn-sub">Cash out opens at {money(minimum)}{balance > 0 ? `: ${money(minimum - balance)} to go` : ''}</span>}
        </div>
        <button type="button" className="btn earn-btn" disabled={busy || balance <= 0 || balance < minimum} onClick={cashOut}>{busy ? 'Sending…' : 'Cash out'}</button>
      </div>
      {msg && <p className="ok" role="status">{msg}</p>}
      {waiting.length > 0 && (
        <p className="earn-wait">{waiting.map((r) => `${money(r.amount)} requested ${day(r.requested_at)}`).join(' · ')}: waiting on payroll</p>
      )}
      {awards.length > 0 && (
        <ul className="earn-list">
          {awards.slice(0, 8).map((a) => {
            const req = requests.find((r) => r.id === a.payout_id);
            return (
              <li key={a.id}>
                <span>{a.reason}</span>
                <span className="earn-status">{req ? (req.status === 'paid' ? `Paid ${day(req.paid_at)}` : 'Requested') : 'Ready'}</span>
                <b>{money(a.amount)}</b>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
