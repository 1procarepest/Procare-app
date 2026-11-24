'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Toggle from '../../../Toggle';

/** Settings → person: runs sales payroll without being in Sales (change 89, e.g. Mark Daniel). C-Suite and the President. */
export default function SalesPayAccess({ person, initial }) {
  const router = useRouter();
  const [on, setOn] = useState(!!initial);
  const [err, setErr] = useState('');
  const flip = async (v) => {
    setErr(''); setOn(v);
    const { error } = await createClient().rpc('set_sales_pay_access', { p_employee: person.id, p_on: v });
    if (error) {
      setErr(/set_sales_pay_access/.test(error.message) ? 'This switch needs database change 89 run in Supabase first.' : error.message);
      setOn(!v);
    } else router.refresh();
  };
  return (
    <section className="panel">
      <h2>Sales pay</h2>
      <Toggle checked={on} onChange={flip}>
        <span>Processes sales pay</span>
        <span className="note">Sees every sales rep’s pay in Sales → Pay: each Statement, Plans and the Everee tab, the same as a sales manager. Can edit pay plans. Their department and everything else stay the same.</span>
      </Toggle>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
