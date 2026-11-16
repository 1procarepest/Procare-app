import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsFor } from '@/lib/apps';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

export default async function RepsLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsFor(me.department, me.level).includes('sales')) redirect('/');

  return (
    <>
      <TopNav me={me} supabase={supabase} current="sales" />
      <main className="admin scorecard reps">{children}</main>
    </>
  );
}
