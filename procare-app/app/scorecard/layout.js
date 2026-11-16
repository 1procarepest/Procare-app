import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsFor } from '@/lib/apps';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

export default async function ScorecardLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsFor(me.department, me.level).includes('technician')) redirect('/');

  return (
    <>
      <TopNav me={me} supabase={supabase} current="technician" extra={me.rank >= 4 && <Link className="toplink" href="/scorecard/rules">Rules</Link>} />
      <main className="admin scorecard">{children}</main>
    </>
  );
}
