import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsFor } from '@/lib/apps';
import TopNav from '../TopNav';
import SalesTabs from './SalesTabs';

export const dynamic = 'force-dynamic';

export default async function RepsLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsFor(me.department, me.level).includes('sales')) redirect('/');
  // Pay tab (moved from the top bar): everyone in sales, plus whoever manages pay
  const { data: boss } = me.department === 'sales' ? { data: true } : await supabase.rpc('can_manage_pay');

  return (
    <>
      <TopNav me={me} supabase={supabase} current="sales" />
      <SalesTabs showPay={me.department === 'sales' || !!boss} />
      <main className="admin scorecard reps">{children}</main>
    </>
  );
}
