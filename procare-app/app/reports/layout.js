import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

/**
 * Forms (was Reports): ride-alongs and follow-behinds for people who fill them out or read them (my_bonus_links().reports),
 * and (change 73) 6-month check-ins and yearly reviews for reviewers: the HR approver, managers, C-Suite and the President.
 */
export default async function ReportsLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me) redirect('/');
  const { data: links } = await supabase.rpc('my_bonus_links');
  if (!links?.reports && !(me.rank >= 3 || me.hr_approver)) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="reports" />
      <main className="admin scorecard reps compete reports">{children}</main>
    </>
  );
}
