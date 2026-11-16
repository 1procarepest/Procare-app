import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

/** Quarterly bonus progress: for people on a bonus, and bonus managers (my_bonus_links().bonus). */
export default async function BonusLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me) redirect('/');
  const { data: links } = await supabase.rpc('my_bonus_links');
  if (!links?.bonus) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="bonus" />
      <main className="admin scorecard reps compete bonus">{children}</main>
    </>
  );
}
