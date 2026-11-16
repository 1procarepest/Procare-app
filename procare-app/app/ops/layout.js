import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsFor } from '@/lib/apps';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

export default async function OpsLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsFor(me.department, me.level).includes('operations')) redirect('/');

  return (
    <>
      <TopNav me={me} supabase={supabase} current="operations" extra={<Link className="toplink" href="/ops/route-plan">Route plan</Link>} />
      <main className="admin scorecard reps ops">{children}</main>
    </>
  );
}
