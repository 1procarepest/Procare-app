'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Toggle from '../Toggle';

const day = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

/** Open truck items with a Fixed switch. items: [{ id, item, created_at|since, who? }] */
export default function TruckList({ items, showWho = true }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [done, setDone] = useState({});
  const [err, setErr] = useState('');
  const fix = async (id) => {
    setDone((d) => ({ ...d, [id]: true }));
    const { data, error } = await sb.rpc('fix_truck_issue', { p_id: id });
    if (error || !data) { setDone((d) => ({ ...d, [id]: false })); setErr(error ? error.message : 'It was already marked fixed.'); }
    router.refresh();
  };
  return (
    <>
      <ul className="rf-truck">
        {items.map((t) => (
          <li key={t.id}>
            <span><b>{t.item}</b><small>{showWho && t.who ? `${t.who} · ` : ''}since {day(t.created_at || t.since)}</small></span>
            <Toggle small checked={!!done[t.id]} disabled={!!done[t.id]} onChange={() => fix(t.id)}>{done[t.id] ? 'Fixed' : 'Open'}</Toggle>
          </li>
        ))}
      </ul>
      {err && <p className="error">{err}</p>}
    </>
  );
}
