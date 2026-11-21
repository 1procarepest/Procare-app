'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Toggle from '../../../Toggle';

/** Settings → person: runs the wildlife team (change 79). C-Suite and the President. */
export default function ManagesWildlife({ person }) {
  const router = useRouter();
  const [on, setOn] = useState(!!person.manages_wildlife);
  const [err, setErr] = useState('');
  const flip = async (v) => {
    setErr(''); setOn(v);
    const { error } = await createClient().rpc('set_manages_wildlife', { p_employee: person.id, p_on: v });
    if (error) { setErr(error.message); setOn(!v); } else router.refresh();
  };
  return (
    <section className="panel">
      <h2>Wildlife manager</h2>
      <Toggle checked={on} onChange={flip}>
        <span>Runs the wildlife team</span>
        <span className="note">Edits the wildlife team’s schedules, approves their time off, gets their schedule and time-off emails, and manages wildlife pay. Wildlife team only.</span>
      </Toggle>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
