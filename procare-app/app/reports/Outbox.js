'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { flush, queued, unqueue } from '@/lib/outbox';
import { KIND_LABEL } from '@/lib/reports';

/** Reports waiting on this phone for a signal: sends them now, again when the phone is back online, and shows any left. */
export default function Outbox() {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [list, setList] = useState([]);
  const [sent, setSent] = useState(0);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (!queued().length) { if (live) setList([]); return; }
      const n = await flush(sb);
      if (!live) return;
      setList(queued());
      if (n) { setSent((x) => x + n); router.refresh(); }
    };
    run();
    window.addEventListener('online', run);
    return () => { live = false; window.removeEventListener('online', run); };
  }, [sb, router]);

  if (!list.length && !sent) return null;
  return (
    <div className="rf-outbox" role="status">
      {sent > 0 && <p className="ok">Sent {sent} report{sent === 1 ? '' : 's'} that {sent === 1 ? 'was' : 'were'} waiting for a signal.</p>}
      {list.length > 0 && (
        <>
          <p><b>{list.length} report{list.length === 1 ? '' : 's'} waiting on this phone.</b> {list.some((r) => !r.problem) ? 'They send when you’re back online.' : ''}</p>
          <ul>
            {list.map((r) => (
              <li key={r.id}>
                {KIND_LABEL[r.kind]} · {r.day}{r.customer ? ` · ${r.customer}` : ''}
                {r.problem && <> · <span className="error">Couldn’t send: {r.problem}</span>{' '}
                  <button type="button" className="link" onClick={() => { if (window.confirm('Delete this report from your phone?')) { unqueue(r.id); setList(queued()); } }}>Delete</button></>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
