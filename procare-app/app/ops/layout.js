import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsFor } from '@/lib/apps';
import SignOut from '../SignOut';

export const dynamic = 'force-dynamic';

export default async function OpsLayout({ children }) {
  const { user, me } = await getMe(createClient());
  if (!user) redirect('/login');
  if (!me || !appsFor(me.department, me.level).includes('operations')) redirect('/');

  return (
    <>
      <header className="topbar">
        <Link href="/" aria-label="Back to my profile"><img src="/logo.png" alt="Procare" /></Link>
        <div className="topbar-links">
          <Link className="toplink" href="/ops">Operations</Link>
          <Link className="toplink" href="/ops/route-plan">Route plan</Link>
          <Link className="toplink" href="/">My profile</Link>
          <SignOut />
        </div>
      </header>
      <main className="admin scorecard reps ops">{children}</main>
    </>
  );
}
