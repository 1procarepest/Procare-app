import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

// Pay: everyone in sales sees their own; sales managers, C-Suite and the President see everyone.
export default async function PayLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  const { data: boss } = me ? await supabase.rpc('can_manage_pay') : { data: false };
  if (!me || (me.department !== 'sales' && !boss)) redirect('/');

  return (
    <>
      <TopNav me={me} supabase={supabase} current="pay" />
      <main className="admin scorecard reps pay">{children}</main>
    </>
  );
}
