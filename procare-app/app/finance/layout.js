import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsOf } from '@/lib/apps';
import { hasSecondStep, verifyHref } from '@/lib/mfa';
import TopNav from '../TopNav';
import FinanceTabs from './FinanceTabs';

export const dynamic = 'force-dynamic';

/** Finance (change 66): C-Suite and the President. */
export default async function FinanceLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsOf(me).includes('finance')) redirect('/');
  // Finance needs the second sign-in step (authenticator code); the database checks it too (change 67)
  if (!(await hasSecondStep(supabase))) redirect(verifyHref('/finance'));
  return (
    <>
      <TopNav me={me} supabase={supabase} current="finance" />
      <FinanceTabs />
      <main className="admin scorecard finance">{children}</main>
    </>
  );
}
