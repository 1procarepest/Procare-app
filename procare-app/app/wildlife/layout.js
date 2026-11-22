import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsOf } from '@/lib/apps';
import TopNav from '../TopNav';
import WildlifeTabs from './WildlifeTabs';

export const dynamic = 'force-dynamic';

/** Wildlife (change 63): the Wildlife department, people with wildlife_access (Jessica), C-Suite and the President. */
export default async function WildlifeLayout({ children }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me || !appsOf(me).includes('wildlife')) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="wildlife" />
      <WildlifeTabs inventory={me.rank >= 3 || !!me.manages_wildlife || (me.department === 'wildlife' && me.rank >= 2)} />
      <main className="admin scorecard wildlife">{children}</main>
    </>
  );
}
