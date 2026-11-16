import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import TeamSchedule from './TeamSchedule';

export const dynamic = 'force-dynamic';

const WEEKS_BACK = 4;
const WEEKS_AHEAD = 8;

export default async function TeamPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  const asked = parseInt(searchParams?.week, 10);
  const week = Number.isNaN(asked) ? 0 : Math.min(WEEKS_AHEAD, Math.max(-WEEKS_BACK, asked));
  // Monday of the chosen week, then Monday–Sunday
  const base = new Date(`${today}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7) + week * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const { data, error } = await supabase.rpc('team_schedule', { p_from: days[0], p_to: days[6] });
  if (error || !data) return <p className="error">The team schedule couldn’t load: {error?.message || 'nothing to show'}</p>;
  return <TeamSchedule data={data} days={days} today={today} week={week} weeksBack={WEEKS_BACK} weeksAhead={WEEKS_AHEAD} meId={me.id} myOffice={me.office} />;
}
