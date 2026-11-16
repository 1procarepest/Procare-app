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
  if (!me || me.rank < 2) redirect('/');

  return (
    <>
      <TopNav me={me} supabase={supabase} current="settings" />
      <AdminNav showSettings={me.rank >= 4} />
      <main className="admin">{children}</main>
    </>
  );
}
