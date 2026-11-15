import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import SignOut from '../SignOut';

export const dynamic = 'force-dynamic';

// Pay: everyone in sales sees their own; sales managers, C-Suite and the President see everyone.
export default async function PayLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  const { data: boss } = me ? await supabase.rpc('can_manage_pay') : { data: false };
  if (!me || (me.department !== 'sales' && !boss)) redirect('/');

  return (
    <>
      <header className="topbar">
        <Link href="/" aria-label="Back to my profile"><img src="/logo.png" alt="Procare" /></Link>
        <div className="topbar-links">
          <Link className="toplink" href="/reps">Rep cards</Link>
          <Link className="toplink" href="/">My profile</Link>
          <SignOut />
        </div>
      </header>
      <main className="admin scorecard reps pay">{children}</main>
    </>
  );
}
