import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { verifyHref } from '@/lib/mfa';
import TrucksView from './TrucksView';

export const dynamic = 'force-dynamic';

/** Operations → Trucks (change 75): the truck sheet. Managers and up; loans and money for C-Suite / the President. */
export default async function TrucksPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 3 || me.department === 'wildlife') redirect('/ops');
  const { data, error } = await supabase.rpc('trucks_data');
  if (error) return <p className="error">The truck sheet couldn’t load: {error.message}{/trucks_data/.test(error.message) ? ' (run change 75 in Supabase first)' : ''}</p>;
  if (!data) redirect('/ops');
  return (
    <TrucksView
      trucks={data.trucks || []}
      people={data.people || []}
      settings={data.settings || null}
      money={!!data.money}
      verify={!data.money && me.rank >= 4 ? verifyHref('/ops/trucks') : null}
      today={todayYmd()}
    />
  );
}
