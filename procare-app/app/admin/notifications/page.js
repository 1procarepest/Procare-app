import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import Switches from './Switches';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (me.rank < 4) redirect('/admin');
  const { data: settings } = await supabase.from('notification_settings').select('key, label, enabled').order('label');
  return <Switches settings={settings || []} />;
}
