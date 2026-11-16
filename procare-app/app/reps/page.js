import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { VIEWS, buildCards, periodLabel, periodRange, todayYmd } from '@/lib/repcards';
import RepCardsView from './RepCardsView';
import CompetitionStrip from '../CompetitionStrip';

export const dynamic = 'force-dynamic';

export default async function RepCardsPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  const view = VIEWS.some((v) => v.key === searchParams?.view) ? searchParams.view : 'week';
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.date || '') ? searchParams.date : today;
  const date = asked > today ? today : asked;
  const range = periodRange(view, date);

  const { data: canSeeAreas } = await supabase.rpc('can_see_rep_areas');
  const tab = searchParams?.tab === 'board' ? 'board' : searchParams?.tab === 'areas' && canSeeAreas ? 'areas' : 'cards';
  const basis = searchParams?.basis === 'service' ? 'service' : 'sold';
  const [{ data: rows, error }, { data: synced }, boardRes, areasRes] = await Promise.all([
    tab === 'cards' ? supabase.rpc('rep_cards', { p_from: range.from, p_to: range.to }) : { data: [] },
    supabase.rpc('rep_cards_synced_at'),
    tab === 'board' ? supabase.rpc('sales_leaderboard', { p_from: range.from, p_to: range.to, p_basis: basis }) : { data: null },
    tab === 'areas' ? supabase.rpc('rep_work_areas', { p_from: range.from, p_to: range.to }) : { data: null },
  ]);
  if (error || boardRes.error || areasRes.error) return <p className="error">The rep cards couldn’t load: {(error || boardRes.error || areasRes.error).message}</p>;
  const { reps, offices, team, officeReps } = buildCards(rows, range.to);

  return (
    <>
    <CompetitionStrip />
    <RepCardsView
      view={view}
      date={date}
      today={today}
      label={periodLabel(view, range)}
      isCurrent={range.to >= today}
      reps={reps}
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
    </>
  );
}
