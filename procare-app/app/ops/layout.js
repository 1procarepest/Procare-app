import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsFor } from '@/lib/apps';
import TopNav from '../TopNav';
import OpsTabs from './OpsTabs';

export const dynamic = 'force-dynamic';

export default async function OpsLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsFor(me.department, me.level).includes('operations')) redirect('/');

  return (
    <>
      <TopNav me={me} supabase={supabase} current="operations" />
      <OpsTabs />
      <main className="admin scorecard reps ops">{children}</main>
    </>
  );
}
