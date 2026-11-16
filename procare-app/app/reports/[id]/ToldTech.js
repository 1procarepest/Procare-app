'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Toggle from '../../Toggle';

/** For the manager who filed it: switch "I told the tech" on after the fact. */
export default function ToldTech({ id, label }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <Toggle checked={on} disabled={on} onChange={async () => {
        setOn(true);
        const { error } = await sb.rpc('mark_told_tech', { p_id: id });
        if (error) { setOn(false); setErr(error.message); return; }
        router.refresh();
      }}>{label}</Toggle>
      {err && <p className="error">{err}</p>}
    </>
  );
}
