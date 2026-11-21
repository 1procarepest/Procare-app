'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Toggle from '../../../Toggle';

/**
 * The wildlife office assist (change 74): this person gets a set amount ($100) for each wildlife sale they help close,
 * taken out of the wildlife team's pay. C-Suite, the President and HR turn it on or off here.
 */
export default function WildlifeAssist({ person }) {
  const [on, setOn] = useState(!!person.wildlife_assist);
  const [err, setErr] = useState('');
  const flip = async (v) => {
    setErr('');
    setOn(v);
    const { error } = await createClient().rpc('set_wildlife_assist', { p_employee: person.id, p_on: v });
    if (error) { setErr(error.message); setOn(!v); }
  };
  return (
    <section className="panel">
      <h2>Wildlife office assist</h2>
      <Toggle checked={on} onChange={flip}>
        <span>{person.first_name} gets paid for helping close wildlife sales</span>
        <span className="note">{on
          ? 'On: the Wildlife Pay page has an Office assist switch on each job; when it’s on, the amount comes out of the wildlife team’s pay and goes to them (on the pay report, not cash out).'
          : 'Off.'}</span>
      </Toggle>
      {err && <p className="error" role="alert">{err}</p>}
    </section>
  );
}
