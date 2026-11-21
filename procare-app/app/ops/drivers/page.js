import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { verifyHref } from '@/lib/mfa';
import DriversView from './DriversView';

export const dynamic = 'force-dynamic';

/** Operations → Drivers (change 78): who is on the company auto policy. */
export default async function DriversPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || (me.rank < 3 && !me.hr_approver)) redirect('/ops');
  const { data, error } = await supabase.rpc('drivers_data');
  if (error) return <p className="error">The driver list couldn’t load: {error.message}{/drivers_data/.test(error.message) ? ' (run change 78 in Supabase first)' : ''}</p>;
  if (!data) redirect('/ops');
  return <DriversView d={data} verify={!data.details && (me.rank >= 4 || me.hr_approver) ? verifyHref('/ops/drivers') : null} />;
}
