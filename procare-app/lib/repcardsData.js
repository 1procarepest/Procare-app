import { VIEWS, buildCards, buildHistory, byStanding, measure, periodRange, pinCities, shiftPeriod } from './repcards';

/**
 * Rep Cards data, shared by the page (app/reps/page.js) and the "show more" route (app/reps/cards/route.js).
 * Both read the same saved copies (rep_cards, rep_card_extras), so loading more cards later is cheap.
 */

/** view / date from the URL, never past today. */
export function readPeriod(searchParams, today) {
  const view = VIEWS.some((v) => v.key === searchParams?.view) ? searchParams.view : 'week';
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.date || '') ? searchParams.date : today;
  const date = asked > today ? today : asked;
  return { view, date, range: periodRange(view, date) };
}

/**
 * Every rep's card for the period, in roster order:
 *   1. reps with doors or sales this period, by services sold, then doors (byStanding)
 *   2. then, while the period is still going (Monday morning), last period's reps with nothing yet, showing zeros,
 *      in last period's order (`idle`, `prevRank`). The day view looks back a week, since yesterday may be a Sunday.
 */
export async function loadRoster(supabase, { view, date, range, today }) {
  const histTo = range.to > today ? today : range.to;
  const isCurrent = range.to >= today;
  const backView = view === 'day' ? 'week' : view;
  const prevRange = periodRange(backView, shiftPeriod(backView, date, -1));
  const [cur, extrasRes, prev] = await Promise.all([
    supabase.rpc('rep_cards', { p_from: range.from, p_to: range.to }),
    supabase.rpc('rep_card_extras', { p_grain: view, p_to: histTo }),
    isCurrent ? supabase.rpc('rep_cards', { p_from: prevRange.from, p_to: prevRange.to }) : Promise.resolve({ data: null }),
  ]);
  if (cur.error) return { error: cur.error };

  const { reps, offices, team, officeReps } = buildCards(cur.data, range.to);
  // Card history follows the period (change 53). If that database change isn't in yet, cards keep the 52 weeks.
  const history = buildHistory(extrasRes?.data, view, histTo);
  const cities = pinCities(extrasRes?.data);

  if (prev.data) {
    const have = new Set(reps.map((r) => r.id));
    buildCards(prev.data, prevRange.to).reps.filter((r) => !have.has(r.id)).forEach((r) => {
      reps.push({ ...r, m: measure({}), idle: true, prevRank: r.rank, prevLabel: view === 'day' || view === 'week' ? 'last week' : `last ${view}` });
    });
  }
  reps.forEach((r, i) => {
    r.rank = i + 1;
    r.cities = cities[r.id] || [];
    if (view !== 'week' && extrasRes?.data) { r.history = history[r.id] || []; r.historyView = view; }
  });
  return { reps, offices, team, officeReps, isCurrent };
}

/** A card without its history table: what's sent for cards that load later. */
export const light = (r) => ({ ...r, weeks: null, history: null, lazy: true });

/** Just the history table parts of a card. */
export const historyOf = (r) => ({ weeks: r.weeks || [], history: r.history || null, historyView: r.historyView || null });

export { byStanding };
