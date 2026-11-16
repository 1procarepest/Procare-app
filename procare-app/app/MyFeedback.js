'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { shortDate } from '@/lib/labels';
import { KIND_LABEL, SKILL_LABEL } from '@/lib/reports';
import { BugTile } from './Bug';
import TruckList from './reports/TruckList';

/**
 * A tech's feedback from ride-alongs and follow-behinds (my_feedback): only reports where the manager told them,
 * and only the parts meant for them. "Got it" shows the manager they read it.
 */
export default function MyFeedback({ data }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [seen, setSeen] = useState({});
  const reports = data?.reports || [];
  const truck = data?.truck || [];
  if (!reports.length && !truck.length) return null;
  const ack = async (id) => {
    setSeen((s) => ({ ...s, [id]: true }));
    await sb.rpc('ack_feedback', { p_id: id });
    router.refresh();
  };
  const fresh = reports.filter((r) => !r.seen && !seen[r.id]);
  const older = reports.filter((r) => r.seen || seen[r.id]).slice(0, 3);

  return (
    <section className="section fb" aria-labelledby="fb-heading">
      <div className="my-card-head"><h2 id="fb-heading">Feedback from your manager</h2></div>
      {truck.length > 0 && (
        <div className="fb-card fb-truck">
          <p className="fb-title"><BugTile kind="tick" tone="lime" size={28} /> Your truck needs attention</p>
          <TruckList items={truck} showWho={false} />
          <p className="calc-hint">Switch each one to Fixed once it’s taken care of.</p>
        </div>
      )}
      {[...fresh, ...older].map((r) => (
        <div key={r.id} className={`fb-card${r.seen || seen[r.id] ? ' fb-seen' : ''}`}>
          {r.favorite && <p className="fb-star">⭐ A customer named you their favorite tech. Nice work!</p>}
          <p className="fb-title">
            <BugTile kind={r.kind === 'ride_along' ? 'cricket' : 'spider'} tone="forest" size={28} />
            {r.kind === 'follow_behind'
              ? `Your service${r.customer ? ` at ${r.customer}` : ''} was checked on ${shortDate(r.day)}`
              : `Ride-along with ${r.from} on ${shortDate(r.day)}`}
          </p>
          {r.customer_praise && <p className="fb-good"><b>The customer said:</b> “{r.customer_praise}”</p>}
          {r.praise && <p className="fb-good"><b>What you did well:</b> {r.praise} <small>— {r.from}</small></p>}
          {r.improve?.length > 0 && <p><b>Focus on:</b> {r.improve.map((k) => SKILL_LABEL[k] || k).join(', ')}</p>}
          {r.note && <p className="fb-note"><b>{r.kind === 'ride_along' ? 'What to work on' : 'One thing to work on'}:</b> {r.note} <small>— {r.from}</small></p>}
          {r.seen || seen[r.id]
            ? <p className="calc-hint">{KIND_LABEL[r.kind]} · you tapped Got it</p>
            : <button type="button" className="btn btn-small" onClick={() => ack(r.id)}>Got it</button>}
        </div>
      ))}
    </section>
  );
}
