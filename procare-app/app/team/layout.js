import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { canSeeTeamSchedule } from '@/lib/teamSchedule';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

export default async function TeamLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!canSeeTeamSchedule(me)) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="team" />
      <main className="admin scorecard reps team">{children}</main>
    </>
  );
}
