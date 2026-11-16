// Live competitions the signed-in person is in, with where they (or their office or team) stand. Server only.
import { ordinal, prizeLine, scoreGroups, scorePeople, fmt } from './competitions';
import { scoreOffices } from './officeKpis';
import { buildBracket, lockedEntrants, makeEntrants, roundName } from './bracket';
import { OFFICE_NAME } from './labels';

export async function myLiveCompetitions(supabase, me, today, limit = 3) {
  try {
    const { data } = await supabase.from('competition_members')
      .select('competitions!inner(*)')
      .eq('employee_id', me.id)
      .lte('competitions.start_date', today)
      .gte('competitions.end_date', today);
    const comps = (data || []).map((r) => r.competitions).sort((a, b) => a.end_date.localeCompare(b.end_date)).slice(0, limit);
    return await Promise.all(comps.map(async (c) => ({ comp: c, prize: prizeLine(c), standing: await standing(supabase, c, me, today) })));
  } catch (e) {
    console.warn('myLiveCompetitions:', e?.message || e);
    return [];
  }
}

async function standing(supabase, c, me, today) {
  if (c.style === 'kpi') {
    const { data: kb } = await supabase.rpc('office_kpi_board', { p_id: c.id });
    if (!kb) return '';
    const { offices } = scoreOffices(kb.offices || [], c.points);
    const mine = offices.find((o) => o.office === me.office);
    return mine ? `${OFFICE_NAME[me.office]} is ${ordinal(mine.rank)} of ${offices.length} · ${fmt(mine.total)} pts` : '';
  }
  const { data: board } = await supabase.rpc('competition_board', { p_id: c.id });
  if (!board) return '';
  if (c.style === 'bracket') {
    if (today <= c.seed_end) {
      const seeding = scorePeople(board, c.points, c.departments, c.start_date, c.seed_end);
      const meRow = seeding.find((p) => p.id === me.id);
      return meRow ? `Seeding: you’re ${ordinal(meRow.rank)} with ${fmt(meRow.points)} pts` : '';
    }
    const seeding = scorePeople(board, c.points, c.departments, c.start_date, c.seed_end);
    const entrants = c.locked_at ? lockedEntrants(board.members || [], c.team_size) : makeEntrants(seeding, c.team_size);
    const br = buildBracket(c, board, entrants, today);
    const r = br.rounds.find((x) => x.started && !x.over);
    if (!r) return 'Bracket';
    const m = r.matches.find((x) => [x.a, x.b].some((e) => e?.members.some((p) => p.id === me.id)));
    if (!m) return `Out · ${roundName(r.index, br.rounds.length)} in progress`;
    const mineA = m.a?.members.some((p) => p.id === me.id);
    const [mine, them] = mineA ? [m.sa, m.sb] : [m.sb, m.sa];
    const opp = mineA ? m.b : m.a;
    return `${roundName(r.index, br.rounds.length)}: ${fmt(mine ?? 0)} to ${fmt(them ?? 0)}${opp ? ` vs ${opp.name}` : ''}`;
  }
  const people = scorePeople(board, c.points, c.departments);
  if (c.compete_as === 'people') {
    const meRow = people.find((p) => p.id === me.id);
    return meRow ? `You’re ${ordinal(meRow.rank)} of ${people.length} · ${fmt(meRow.points)} pts` : '';
  }
  const groups = scoreGroups(people, c.compete_as);
  const g = groups.find((x) => x.members.some((p) => p.id === me.id));
  return g ? `${g.name} is ${ordinal(g.rank)} of ${groups.length} · ${fmt(g.avg)} per person` : '';
}
