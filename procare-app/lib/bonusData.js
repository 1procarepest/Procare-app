// Loads a quarter's bonus goal sets with everything needed to score them (server pages: /bonus and Settings → Bonuses).
// Row level security decides which sets come back: the person's own, or all of them for bonus managers.
import { DEFAULT_SCALE, prevQuarter, quarterRange, scoreSet } from './bonus';

export async function loadQuarter(supabase, year, quarter, today) {
  const { from, to } = quarterRange(year, quarter);
  const p = prevQuarter(year, quarter);
  const pr = quarterRange(p.year, p.quarter);
  const [{ data: sets, error }, { data: settings }, { data: nums }, { data: prevNums }, { data: tally }, { data: planRows }] = await Promise.all([
    supabase.from('bonus_sets')
      .select('*, bonus_members(employee_id, employees(id, first_name, last_name, office, department, level)), bonus_goals(*)')
      .eq('year', year).eq('quarter', quarter).order('name'),
    supabase.from('bonus_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.rpc('bonus_numbers', { p_from: from, p_to: to }),
    supabase.rpc('bonus_numbers', { p_from: pr.from, p_to: pr.to }),
    supabase.rpc('report_tally', { p_from: from, p_to: to }),
    supabase.from('bonus_plans').select('employee_id, amount').eq('year', year),
  ]);
  const goalIds = (sets || []).flatMap((s) => (s.bonus_goals || []).map((g) => g.id));
  const { data: entries } = goalIds.length
    ? await supabase.from('bonus_entries').select('*, employees(first_name, last_name)').in('goal_id', goalIds).order('day', { ascending: false })
    : { data: [] };
  const plans = Object.fromEntries((planRows || []).map((r) => [r.employee_id, Number(r.amount)]));
  const scale = { ...DEFAULT_SCALE, ...(settings?.scale || {}) };

  const scored = (sets || []).map((s) => {
    const goals = [...(s.bonus_goals || [])].sort((x, y) => x.sort - y.sort);
    const members = (s.bonus_members || []).map((m) => ({ employee_id: m.employee_id, ...(m.employees || {}) }));
    const live = scoreSet({ set: s, goals, members, plans, nums, prevNums, entries, tally, today, scale });
    // Once approved, the saved final numbers are what was paid
    const score = s.approved_at && s.results ? { ...live, ...s.results, final: true } : live;
    return { ...s, goals, members, score, entries: (entries || []).filter((e) => goals.some((g) => g.id === e.goal_id)) };
  });
  return { sets: scored, error, settings: { ...(settings || {}), scale }, nums, plans, from, to };
}
