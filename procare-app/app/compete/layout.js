import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

export default async function CompeteLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="compete" />
      <main className="admin scorecard reps compete">{children}</main>
    </>
  );
}
