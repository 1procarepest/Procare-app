import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TopNav from '../TopNav';
import BonusTabs from './BonusTabs';

export const dynamic = 'force-dynamic';

/** Quarterly bonuses: Your goals (people on a bonus) and Manage bonuses (bonus managers), as sub-tabs. */
export default async function BonusLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me) redirect('/');
  const [{ data: links }, { count }] = await Promise.all([
    supabase.rpc('my_bonus_links'),
    supabase.from('bonus_members').select('set_id', { count: 'exact', head: true }).eq('employee_id', me.id),
  ]);
  if (!links?.bonus) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="bonus" />
      <BonusTabs mine={count > 0} manage={!!links?.manage} />
      <main className="admin scorecard reps compete bonus">{children}</main>
    </>
  );
}
