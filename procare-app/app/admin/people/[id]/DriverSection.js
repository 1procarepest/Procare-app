import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { verifyHref } from '@/lib/mfa';
import DriverEditor from '../../../ops/drivers/DriverEditor';

/** Settings → person: company driver (change 78). C-Suite, the President and HR. */
export default async function DriverSection({ personId }) {
  const { data } = await createClient().rpc('drivers_data');
  const p = (data?.people || []).find((x) => x.id === personId);
  if (!data || !p) return null;
  return (
    <section className="panel admin-driver">
      <h2 className="fin-h2">Company driver</h2>
      {data.details ? <DriverEditor p={p} agent={data.agent} /> : (
        <p className="note">{p.approved_driver ? 'Approved driver (on the company auto policy).' : 'Not an approved driver.'} License details and the switch need the authenticator step: <a href={verifyHref(`/admin/people/${personId}`)}>verify</a>.</p>
      )}
      <p className="note"><Link href="/ops/drivers">All drivers →</Link></p>
    </section>
  );
}
