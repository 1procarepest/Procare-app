'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Ads → Sync now: copies the last `days` days from Google (the ad team gets 7; C-Suite / President can ask for more). */
export default function SyncNow({ days = 7, label = 'Sync now', quiet = false }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async () => {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/gads/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    const parts = [];
    if (j.accounts !== undefined) parts.push(`${j.accounts} ad account${j.accounts === 1 ? '' : 's'}, ${j.leads} lead${j.leads === 1 ? '' : 's'}`);
    if (j.website) parts.push(`${Number(j.website.sessions || 0).toLocaleString('en-US')} website visits`);
    setMsg(j.ok
      ? { ok: !(j.notes || []).length, text: `Copied the last ${j.days} days${parts.length ? `: ${parts.join('; ')}` : ''}.${(j.notes || []).length ? ` ${j.notes.join(' ')}` : ''}` }
      : { ok: false, text: j.error || `Error ${res.status}` });
    router.refresh();
  };
  return (
    <>
      <button className={`btn btn-small${quiet ? ' btn-quiet' : ''}`} type="button" disabled={busy} onClick={run}>{busy ? 'Copying…' : label}</button>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </>
  );
}
