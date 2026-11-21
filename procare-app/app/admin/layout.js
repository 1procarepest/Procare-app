import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import AdminNav from './AdminNav';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  // Wildlife: Wildlife-only access. Jessica (manages_wildlife, change 79) gets the wildlife team's people, time off and issues.
  if (!me || (me.rank < 2 && !me.manages_wildlife) || me.department === 'wildlife') redirect('/');

  return (
    <>
      <TopNav me={me} supabase={supabase} current="settings" />
      <AdminNav showSettings={me.rank >= 4} showPayouts={me.rank >= 4 || !!me.hr_approver} showReviews={me.rank >= 3 || !!me.hr_approver} />
      <main className="admin">{children}</main>
    </>
  );
}
