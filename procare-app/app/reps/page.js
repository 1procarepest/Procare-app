import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { OFFICES } from '@/lib/labels';
import { periodLabel, todayYmd } from '@/lib/repcards';
import { light, loadRoster, readPeriod } from '@/lib/repcardsData';
import RepCardsView from './RepCardsView';

export const dynamic = 'force-dynamic';

// Cards that come with their history table on the first load: your own, plus the top 5 overall and in each
// office (so picking an office needs no wait). The rest load when someone taps "Show 6–10" / "Show everyone else".
const FIRST = 5;

export default async function RepCardsPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  const { view, date, range } = readPeriod(searchParams, today);

  const { data: canSeeAreas } = await supabase.rpc('can_see_rep_areas');
  const tab = searchParams?.tab === 'board' ? 'board' : searchParams?.tab === 'areas' && canSeeAreas ? 'areas' : 'cards';
  const basis = searchParams?.basis === 'service' ? 'service' : 'sold';
  const [roster, { data: synced }, boardRes, areasRes] = await Promise.all([
    tab === 'cards' ? loadRoster(supabase, { view, date, range, today }) : { reps: [], offices: {}, team: null, officeReps: {} },
    supabase.rpc('rep_cards_synced_at'),
    tab === 'board' ? supabase.rpc('sales_leaderboard', { p_from: range.from, p_to: range.to, p_basis: basis }) : { data: null },
    tab === 'areas' ? supabase.rpc('rep_work_areas', { p_from: range.from, p_to: range.to }) : { data: null },
  ]);
  const error = roster.error || boardRes.error || areasRes.error;
  if (error) return <p className="error">The rep cards couldn’t load: {error.message}</p>;
  const { reps, offices, team, officeReps } = roster;

  const first = new Set(me?.id ? [me.id] : []);
  const top = (list) => list.filter((r) => r.id !== me?.id).slice(0, FIRST).forEach((r) => first.add(r.id));
  top(reps);
  OFFICES.forEach((o) => top(reps.filter((r) => r.office === o.key)));

  return (
    <RepCardsView
      view={view}
      date={date}
      today={today}
      label={periodLabel(view, range)}
      isCurrent={range.to >= today}
      reps={reps.map((r) => (first.has(r.id) ? r : light(r)))}
      offices={offices}
      team={team}
      officeReps={officeReps}
      meId={me?.id}
      syncedAt={synced || null}
      tab={tab}
      basis={basis}
      board={boardRes.data}
      canSeeAreas={!!canSeeAreas}
      areas={areasRes.data}
    />
  );
}
