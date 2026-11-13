import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import AdminNav from './AdminNav';
import SignOut from '../SignOut';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  const { user, me } = await getMe(createClient());
  if (!user) redirect('/login');
  if (!me || me.rank < 2) redirect('/');

  return (
    <>
      <header className="topbar">
        <Link href="/" aria-label="Back to my profile"><img src="/logo.png" alt="Procare" /></Link>
        <div className="topbar-links">
          <Link className="toplink" href="/">My profile</Link>
          <SignOut />
        </div>
      </header>
      <AdminNav showSettings={me.rank >= 4} />
      <main className="admin">{children}</main>
    </>
  );
}
