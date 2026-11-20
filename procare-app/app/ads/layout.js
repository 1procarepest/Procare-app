import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsOf } from '@/lib/apps';
import TopNav from '../TopNav';
import AdsTabs from './AdsTabs';

export const dynamic = 'force-dynamic';

/** Ads (change 71): C-Suite, the President and the ad team (Ads access). */
export default async function AdsLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsOf(me).includes('ads')) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="ads" />
      <AdsTabs manage={me.rank >= 4} />
      <main className="admin scorecard finance">{children}</main>
    </>
  );
}
