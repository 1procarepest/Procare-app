import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import TeamSchedule from './TeamSchedule';

export const dynamic = 'force-dynamic';

const WEEKS_BACK = 4;
const WEEKS_AHEAD = 8;
const MONTHS_BACK = 1;
const MONTHS_AHEAD = 2;

export default async function TeamPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  // Sales reps' availability forms update their schedule on their own: a note for sales managers and up (change 55)
  const { data: updates } = await supabase.rpc('recent_availability_updates', { p_days: 14 });
  // Week is the default; ?span=month shows a month calendar (?month=1 is next month)
  if (searchParams?.span === 'month') {
    const askedMonth = parseInt(searchParams?.month, 10);
    const month = Number.isNaN(askedMonth) ? 0 : Math.min(MONTHS_AHEAD, Math.max(-MONTHS_BACK, askedMonth));
    const t = new Date(`${today}T12:00:00Z`);
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + month, 1, 12));
    const days = [];
    for (const d = new Date(first); d.getUTCMonth() === first.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
    const { data, error } = await supabase.rpc('team_schedule', { p_from: days[0], p_to: days[days.length - 1] });
    if (error || !data) return <p className="error">The team schedule couldn’t load: {error?.message || 'nothing to show'}</p>;
    return <TeamSchedule data={data} days={days} today={today} month={month} monthsBack={MONTHS_BACK} monthsAhead={MONTHS_AHEAD} weeksBack={WEEKS_BACK} weeksAhead={WEEKS_AHEAD} meId={me.id} myOffice={me.office} updates={updates || []} />;
  }
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
  // ?day= comes from tapping a day on the month calendar
  const pick = days.includes(searchParams?.day) ? searchParams.day : null;
  return <TeamSchedule data={data} days={days} today={today} week={week} weeksBack={WEEKS_BACK} weeksAhead={WEEKS_AHEAD} pick={pick} meId={me.id} myOffice={me.office} updates={updates || []} />;
}
