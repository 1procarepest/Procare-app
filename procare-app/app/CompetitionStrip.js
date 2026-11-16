import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { myLiveCompetitions } from '@/lib/myCompetitions';
import MyCompetitions from './MyCompetitions';

/**
 * "Your competitions" for the top of the Performance Cards: live competitions the signed-in person
 * is in and where they stand. Renders nothing when they aren't in any.
 */
export default async function CompetitionStrip() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me) return null;
  const list = await myLiveCompetitions(supabase, me, todayYmd());
  return <MyCompetitions list={list} compact />;
}
