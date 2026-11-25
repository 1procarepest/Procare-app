import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TopNav from '../TopNav';

export const dynamic = 'force-dynamic';

/** Onboarding (change 92): everyone. */
export default async function OnboardingLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="onboarding" />
      <main className="admin scorecard onboarding ops-fun">{children}</main>
    </>
  );
}
