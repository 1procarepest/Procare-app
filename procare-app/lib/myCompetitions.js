// Live competitions the signed-in person is in, with where they (or their office or team) stand, plus the ones a
// leader watches for their department (see watchScope). Server only.
import { ordinal, prizeLine, scoreGroups, scorePeople, fmt } from './competitions';
import { scoreOffices } from './officeKpis';
import { buildBracket, lockedEntrants, makeEntrants, roundName } from './bracket';
import { OFFICE_NAME } from './labels';

export async function myLiveCompetitions(supabase, me, today, limit = 6) {
  try {
    const [{ data: live }, { data: follows }] = await Promise.all([
      supabase.from('competitions').select('*').lte('start_date', today).gte('end_date', today),
      supabase.from('competition_follows').select('department, office').eq('employee_id', me.id),
    ]);
    if (!live?.length) return [];
    const { data: members } = await supabase.from('competition_members')
      .select('competition_id, employee_id, employees(office)')
      .in('competition_id', live.map((c) => c.id));
    const inIt = new Set();
    const officesIn = new Map(live.map((c) => [c.id, new Set()]));
    (members || []).forEach((m) => {
      if (m.employee_id === me.id) inIt.add(m.competition_id);
      if (m.employees?.office) officesIn.get(m.competition_id)?.add(m.employees.office);
    });
    const comps = live
      .map((c) => ({ c, mine: inIt.has(c.id), scope: inIt.has(c.id) ? null : watchScope(c, me, follows || [], officesIn.get(c.id)) }))
      .filter((x) => x.mine || x.scope)
      .sort((a, b) => (b.mine - a.mine) || a.c.end_date.localeCompare(b.c.end_date))
      .slice(0, limit);
    return await Promise.all(comps.map(async ({ c, mine, scope }) => ({
      comp: c,
      prize: prizeLine(c),
      watching: !mine,
      standing: mine ? await standing(supabase, c, me, today) : await leaderLine(supabase, c, scope, today),
    })));
  } catch (e) {
    console.warn('myLiveCompetitions:', e?.message || e);
    return [];
  }
}

/**
 * Leaders see their department's competitions even when they aren't in them. Returns 'all' (every office),
 * an office key (just that office), or null (not theirs to watch).
 *   President: everything. Leads and up: their own department, in their own office (no office = every office).
 *   competition_follows: extra departments set per person (e.g. Ryan Boyd: technician and office, every office).
 */
function watchScope(c, me, follows, officesIn) {
  if (me.rank >= 5) return 'all';
  const scopes = [];
  if (me.rank >= 2 && c.departments.includes(me.department)) scopes.push(me.office || 'all');
  follows.forEach((f) => { if (c.departments.includes(f.department)) scopes.push(f.office || 'all'); });
  if (scopes.includes('all')) return 'all';
  // No member has an office set (e.g. office staff): the competition counts for every office.
  return scopes.find((o) => c.style === 'kpi' || !officesIn?.size || officesIn.has(o)) || null;
}

/** Who's ahead, for someone watching (in their office when they watch one office). */
async function leaderLine(supabase, c, scope, today) {
  const office = scope === 'all' ? null : scope;
  if (c.style === 'kpi') {
    const { data: kb } = await supabase.rpc('office_kpi_board', { p_id: c.id });
    if (!kb) return '';
    const { offices } = scoreOffices(kb.offices || [], c.points);
    const o = (office && offices.find((x) => x.office === office)) || offices[0];
    if (!o) return '';
    return office && o.office === office
      ? `${OFFICE_NAME[office]} is ${ordinal(o.rank)} of ${offices.length} · ${fmt(o.total)} pts`
      : `${OFFICE_NAME[o.office] || o.office} leads · ${fmt(o.total)} pts`;
  }
  const { data: board } = await supabase.rpc('competition_board', { p_id: c.id });
  if (!board) return '';
  const name = (p) => `${p.first_name} ${p.last_name}`.trim();
  const top = (people) => {
    const pool = office ? people.filter((p) => p.office === office) : people;
    const p = pool[0];
    if (!p) return '';
    return office
      ? `Top in ${OFFICE_NAME[office]}: ${name(p)} · ${fmt(p.points)} pts (${ordinal(p.rank)} overall)`
      : `Leading: ${name(p)} · ${fmt(p.points)} pts`;
  };
  if (c.style === 'bracket') {
    if (today <= c.seed_end) return `Seeding · ${top(scorePeople(board, c.points, c.departments, c.start_date, c.seed_end))}`;
    const seeding = scorePeople(board, c.points, c.departments, c.start_date, c.seed_end);
    const entrants = c.locked_at ? lockedEntrants(board.members || [], c.team_size) : makeEntrants(seeding, c.team_size);
    const br = buildBracket(c, board, entrants, today);
    const r = br.rounds.find((x) => x.started && !x.over);
    return r ? `${roundName(r.index, br.rounds.length)} in progress` : 'Bracket';
  }
  const people = scorePeople(board, c.points, c.departments);
  if (c.compete_as === 'people') return top(people);
  const groups = scoreGroups(people, c.compete_as);
  const g = (office && c.compete_as === 'offices' && groups.find((x) => x.key === office)) || groups[0];
  if (!g) return '';
  return g.rank === 1 ? `${g.name} leads · ${fmt(g.avg)} per person` : `${g.name} is ${ordinal(g.rank)} of ${groups.length} · ${fmt(g.avg)} per person`;
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
