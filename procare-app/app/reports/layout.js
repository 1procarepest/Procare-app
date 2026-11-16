import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

/** Ride-alongs and follow-behinds: for people who fill them out or read them (my_bonus_links().reports). */
export default async function ReportsLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me) redirect('/');
  const { data: links } = await supabase.rpc('my_bonus_links');
  if (!links?.reports) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="reports" />
      <main className="admin scorecard reps compete reports">{children}</main>
    </>
  );
}
