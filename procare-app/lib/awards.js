// Competition prizes: who won what. Server only (writes with the admin key).
// Leaderboards and office KPIs pay by place (payouts.places = [1st, 2nd, …]); brackets pay each round's
// winners (payouts.rounds, the last being the champion's grand prize). Team and office prizes are split
// evenly among the members. A tie shares the prizes for the places it covers. Each prize is paid once
// (award_key), and only after the competition (or round) is over and the data has caught up.
import { ordinal, scoreGroups, scorePeople, serviceDeadline } from './competitions';
import { bracketEnd, buildBracket, lockedEntrants, makeEntrants, roundName, seedingFinal, waitDays } from './bracket';
import { scoreOffices } from './officeKpis';
import { OFFICE_NAME } from './labels';
import { createAdminClient } from './supabase/admin';

const cents = (n) => Math.round(n * 100) / 100;

/** Ranked entries [{ rank, memberIds, label }] → awards by place. */
function byPlace(comp, entries, places) {
  const out = [];
  const list = entries.filter((e) => e.memberIds.length);
  for (let i = 0; i < list.length;) {
    const rank = list[i].rank;
    const tied = list.filter((e) => e.rank === rank);
    const start = rank - 1;
    const pool = places.slice(start, start + tied.length).reduce((t, x) => t + (Number(x) || 0), 0);
    if (pool > 0) {
      tied.forEach((e) => {
        const each = cents(pool / tied.length / e.memberIds.length);
        if (each > 0) e.memberIds.forEach((id) => out.push({ employee_id: id, award_key: 'place', amount: each, reason: `${ordinal(rank)} place${e.label ? ` (${e.label})` : ''} · ${comp.name}` }));
      });
    }
    i += tied.length;
  }
  return out;
}

/**
 * Awards due for one competition right now, and whether it's fully settled.
 * ctx: { board } for leaderboards and brackets, { kpi, members } for office KPIs.
 */
export function awardsFor(comp, ctx, today) {
  const pay = comp.payouts || {};
  const places = (pay.places || []).map(Number);
  if (comp.style === 'kpi') {
    const kb = ctx.kpi;
    if (!(today > comp.end_date && kb?.end_day && kb.end_day > comp.end_date)) return { rows: [], final: false };
    const { offices } = scoreOffices(kb.offices || [], comp.points);
    const entries = offices.filter((o) => o.total > 0).map((o) => ({
      rank: o.rank, label: OFFICE_NAME[o.office], memberIds: (ctx.members || []).filter((m) => m.office === o.office).map((m) => m.id),
    }));
    return { rows: byPlace(comp, entries, places), final: true };
  }
  const board = ctx.board;
  if (!board) return { rows: [], final: false };
  if (comp.style === 'bracket') {
    if (today <= comp.seed_end) return { rows: [], final: false };
    const rounds = (pay.rounds || []).map(Number);
    const seeding = scorePeople(board, comp.points, comp.departments, comp.start_date, comp.seed_end);
    const entrants = comp.locked_at ? lockedEntrants(board.members || [], comp.team_size) : makeEntrants(seeding, comp.team_size);
    const br = buildBracket(comp, board, entrants, today);
    const rows = [];
    br.rounds.forEach((r) => {
      if (!r.over) return;
      const amount = rounds[r.index] || 0;
      if (amount <= 0) return;
      const last = r.index === br.rounds.length - 1;
      r.matches.forEach((m) => {
        if (!m.winner || m.bye) return;
        const each = cents(amount / m.winner.members.length);
        m.winner.members.forEach((p) => rows.push({
          employee_id: p.id, award_key: `round-${r.index}`, amount: each,
          reason: `${last ? 'Champion' : `Won ${roundName(r.index, br.rounds.length)}`}${comp.team_size > 1 ? ` (${m.winner.name})` : ''} · ${comp.name}`,
        }));
      });
    });
    return { rows, final: !!br.champion || (br.rounds.length > 0 && br.rounds.every((r) => r.over)) };
  }
  // leaderboard: final once the service window after the end has passed (and the data has caught up)
  const finalDay = serviceDeadline(comp.points, comp.end_date) || comp.end_date;
  if (!(today > finalDay && board.through && board.through >= finalDay)) return { rows: [], final: false };
  const people = scorePeople(board, comp.points, comp.departments);
  let entries;
  if (comp.compete_as === 'people') {
    entries = people.filter((p) => p.points > 0).map((p) => ({ rank: p.rank, memberIds: [p.id] }));
  } else {
    entries = scoreGroups(people, comp.compete_as).filter((g) => g.points > 0)
      .map((g) => ({ rank: g.rank, label: g.name, memberIds: g.members.map((m) => m.id) }));
  }
  return { rows: byPlace(comp, entries, places), final: true };
}

/**
 * Locks a bracket once seeding is over and the data has caught up: saves each member's seed (and team)
 * so late data can't reshuffle it. `db` must be allowed to write (the admin client, or an editor).
 * Returns the updated competition, or null if it isn't time yet.
 */
export async function lockBracket(db, comp, board, today) {
  const ready = seedingFinal(comp);   // seeding end + the service window
  if (comp.style !== 'bracket' || comp.locked_at || !(today > ready) || !(board?.through && board.through >= ready)) return null;
  const seeding = scorePeople(board, comp.points, comp.departments, comp.start_date, comp.seed_end);
  const entrants = makeEntrants(seeding, comp.team_size);
  const rows = entrants.flatMap((e) => e.members.map((m) => ({
    competition_id: comp.id, employee_id: m.id, seed: e.seed, team: comp.team_size > 1 ? e.name : null,
  })));
  const { error } = await db.from('competition_members').upsert(rows);
  if (error) return null;
  const { data } = await db.from('competitions')
    .update({ locked_at: new Date().toISOString(), end_date: bracketEnd(comp.seed_end, comp.round_days, entrants.length, waitDays(comp)) })
    .eq('id', comp.id).select('*').single();
  return data || null;
}

/**
 * Pays out any competition (or bracket round) that has finished. Safe to call on every page load:
 * it only looks at unsettled competitions whose time is up, and each prize is written once.
 * `supabase` is the signed-in person's client (reads the standings); writes use the admin key.
 */
export async function settleCompetitions(supabase, today) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: due } = await admin.from('competitions').select('*').is('settled_at', null).lt('start_date', today)
      .or(`end_date.lt.${today},and(style.eq.bracket,seed_end.lt.${today})`);
    for (const comp of due || []) {
      const hasMoney = [...(comp.payouts?.places || []), ...(comp.payouts?.rounds || [])].some((x) => Number(x) > 0);
      if (!hasMoney) {
        if (today > comp.end_date) await admin.from('competitions').update({ settled_at: new Date().toISOString() }).eq('id', comp.id);
        continue;
      }
      let ctx;
      if (comp.style === 'kpi') {
        const [{ data: kpi }, { data: mem }] = await Promise.all([
          supabase.rpc('office_kpi_board', { p_id: comp.id }),
          admin.from('competition_members').select('employees(id, office)').eq('competition_id', comp.id),
        ]);
        ctx = { kpi, members: (mem || []).map((m) => m.employees).filter(Boolean) };
      } else {
        let { data: board } = await supabase.rpc('competition_board', { p_id: comp.id });
        if (comp.style === 'bracket' && !comp.locked_at) {
          const locked = await lockBracket(admin, comp, board, today);
          if (!locked) continue;   // seeding data not in yet
          Object.assign(comp, locked);
          ({ data: board } = await supabase.rpc('competition_board', { p_id: comp.id }));
        }
        ctx = { board };
      }
      const { rows, final } = awardsFor(comp, ctx, today);
      if (rows.length) {
        await admin.from('competition_awards').upsert(rows.map((r) => ({ ...r, competition_id: comp.id })),
          { onConflict: 'competition_id,employee_id,award_key', ignoreDuplicates: true });
      }
      if (final) await admin.from('competitions').update({ settled_at: new Date().toISOString() }).eq('id', comp.id);
    }
  } catch (e) {
    console.warn('settleCompetitions:', e?.message || e);   // never break the page over prizes
  }
}
