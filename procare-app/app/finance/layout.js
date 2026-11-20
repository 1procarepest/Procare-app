import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsFor } from '@/lib/apps';
import TopNav from '../TopNav';
import FinanceTabs from './FinanceTabs';

export const dynamic = 'force-dynamic';

/** Finance (change 66): C-Suite and the President. */
export default async function FinanceLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsFor(me.department, me.level, !!me.wildlife_access).includes('finance')) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="finance" />
      <FinanceTabs />
      <main className="admin scorecard finance">{children}</main>
    </>
  );
}
