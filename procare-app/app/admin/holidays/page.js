import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import HolidaySwitches from './HolidaySwitches';

export const dynamic = 'force-dynamic';

export default async function HolidaysPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (me.rank < 4) redirect('/admin');
  const { data, error } = await supabase.from('company_holidays').select('key, name, enabled').order('sort');
  if (error) return <p className="error">Holidays couldn’t load: {error.message}</p>;
  return <HolidaySwitches rows={data || []} today={todayYmd()} />;
}
