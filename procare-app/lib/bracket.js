import { scorePeople, serveDays } from './competitions';

const toDate = (ymd) => new Date(`${String(ymd).slice(0, 10)}T12:00:00Z`);
export const addDays = (ymd, n) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Days to wait after seeding or a round for sales to be serviced (0 when sales don't need to be serviced). */
export const waitDays = (comp) => serveDays(comp?.points) ?? 0;

/** The day seeding results are final (seeding end + the service window). */
export const seedingFinal = (comp) => addDays(comp.seed_end, waitDays(comp));

/** How many rounds a bracket of n entrants needs (2 → 1, 3-4 → 2, 5-8 → 3 …). */
export const roundsFor = (n) => (n < 2 ? 0 : Math.ceil(Math.log2(n)));

/** Number of bracket entrants for a head count and team size. Teams: as many full teams as possible. */
export const entrantCount = (people, teamSize) => (teamSize > 1 ? Math.floor(people / teamSize) : people);

/**
 * Round r (0 = first) start and end dates, and when its results are final (end + the service window).
 * With a service window, each round (and round 1, after seeding) starts only once the one before is final.
 */
export function roundDates(comp, r) {
  const w = waitDays(comp);
  const start = addDays(comp.seed_end, 1 + w + r * (comp.round_days + w));
  const end = addDays(start, comp.round_days - 1);
  return { start, end, final: addDays(end, w) };
}

/** End of the last round, for a given number of entrants (and service window). */
export function bracketEnd(seedEnd, roundDays, entrants, wait = 0) {
  return addDays(seedEnd, Math.max(1, roundsFor(entrants)) * (roundDays + wait));
}

/**
 * Entrants in seed order from the seeding standings (already ranked).
 * Teams are balanced snake-style: with 4 teams, seeds 1-4 go to teams 1-4, seeds 5-8 to teams 4-1, and so on,
 * so every team gets a top, middle and bottom finisher. Leftover people join teams (those teams have 4; averages keep it fair).
 */
export function makeEntrants(seeding, teamSize) {
  if (teamSize <= 1) {
    return seeding.map((p, i) => ({ key: p.id, seed: i + 1, name: `${p.first_name} ${p.last_name}`.trim(), members: [p] }));
  }
  const count = Math.max(1, Math.floor(seeding.length / teamSize));
  const teams = Array.from({ length: count }, () => []);
  seeding.forEach((p, i) => {
    const lap = Math.floor(i / count);
    const pos = i % count;
    teams[lap % 2 === 0 ? pos : count - 1 - pos].push(p);
  });
  const used = new Set();
  return teams.map((members, i) => {
    const top = members[0];
    let name = `Team ${top.first_name}`;
    if (used.has(name)) name = `Team ${top.first_name} ${(top.last_name || '').slice(0, 1)}`.trim();
    while (used.has(name)) name += '+';
    used.add(name);
    return { key: name, seed: i + 1, name, members };
  });
}

/** Entrants from a locked bracket (seed and team saved on each member). */
export function lockedEntrants(members, teamSize) {
  if (teamSize <= 1) {
    return members.filter((m) => m.seed).sort((a, b) => a.seed - b.seed)
      .map((m) => ({ key: m.id, seed: m.seed, name: `${m.first_name} ${m.last_name}`.trim(), members: [m] }));
  }
  const by = new Map();
  members.filter((m) => m.seed && m.team).forEach((m) => {
    if (!by.has(m.team)) by.set(m.team, { key: m.team, seed: m.seed, name: m.team, members: [] });
    by.get(m.team).members.push(m);
  });
  return [...by.values()].sort((a, b) => a.seed - b.seed);
}

/** Standard bracket order so 1 and 2 can only meet in the final: 4 → [1, 4, 2, 3]. */
function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    order = order.flatMap((s) => [s, n - s]);
  }
  return order;
}

/**
 * Every round's matchups with scores. A match is decided once its round is over (and the data has caught up);
 * the higher score moves on, a tie goes to the higher seed, and a missing opponent is a bye.
 */
export function buildBracket(comp, board, entrants, today) {
  const n = entrants.length;
  const rounds = roundsFor(n);
  if (!rounds) return { rounds: [], champion: null };
  const size = 2 ** rounds;
  const bySeed = Object.fromEntries(entrants.map((e) => [e.seed, e]));
  const through = board.through || null;
  let slots = seedOrder(size).map((s) => bySeed[s] || null);
  const out = [];
  for (let r = 0; r < rounds; r += 1) {
    const { start, end, final } = roundDates(comp, r);
    const started = today >= start;
    const over = today > final && through && through >= final;   // decided once the service window has passed
    const scores = started ? scorePeople(board, comp.points, comp.departments, start, end) : [];
    const pts = Object.fromEntries(scores.map((p) => [p.id, p.points]));
    const scoreOf = (e) => (e && started ? e.members.reduce((s, m) => s + (pts[m.id] || 0), 0) / e.members.length : null);
    const matches = [];
    const next = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i];
      const b = slots[i + 1];
      const sa = scoreOf(a);
      const sb = scoreOf(b);
      // Only the first round has byes; later, an empty slot means that match isn't decided yet.
      const bye = r === 0 && !!((a && !b) || (b && !a));
      let winner = null;
      if (bye) winner = a || b;
      else if (a && b && over) winner = sa > sb || (sa === sb && a.seed < b.seed) ? a : b;
      matches.push({ a, b, sa, sb, winner, bye, live: started && !over && !bye && !!a && !!b });
      next.push(winner);
    }
    out.push({ index: r, start, end, final, started, over: !!over, waiting: today > end && !over, matches });
    slots = next;
  }
  const last = out[out.length - 1].matches[0];
  return { rounds: out, champion: last.winner && out[out.length - 1].over ? last.winner : null };
}

export const roundName = (r, total) => (r === total - 1 ? 'Final' : r === total - 2 ? 'Semifinals' : r === total - 3 ? 'Quarterfinals' : `Round ${r + 1}`);
