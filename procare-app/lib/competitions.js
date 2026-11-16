import { OFFICE_NAME } from './labels';

/** What earns points. Values are set per competition; these are the starting defaults. */
export const KINDS = [
  { key: 'sale', label: 'Sale serviced', short: 'Sales', hint: 'A sale gets its first service done (credited to whoever sold it).', def: 3 },
  { key: 'service', label: 'Completed service', short: 'Services', hint: 'Each job a tech completes.', def: 1 },
  { key: 'autopay', label: 'Auto-pay', short: 'Auto-pay', hint: 'Techs: a customer turns on auto-pay the day the tech services them. Reps: a serviced sale on auto-pay.', def: 2 },
  { key: 'review', label: 'Review', short: 'Reviews', hint: 'A review with enough stars (credited to the tech on that visit).', def: 1 },
];
export const DEFAULT_TIERS = [{ over: 420, pts: 0.5 }];
export const DEFAULT_POINTS = { sale: 3, service: 1, autopay: 2, review: 1, review_stars: 5, tiers: DEFAULT_TIERS };

/**
 * What each group competes on. One department: its own KPIs. More than one (company-wide):
 * only what every department shares, office vs. office.
 */
const BY_DEPT = { sales: ['sale', 'autopay'], technician: ['service', 'autopay', 'review', 'sale'], administrative: [] };
export function kindsFor(depts = []) {
  const keys = depts.length === 1 ? BY_DEPT[depts[0]] || [] : ['sale', 'autopay', 'review'];
  return keys.map((k) => KINDS.find((x) => x.key === k));
}
/** Contract value tiers are for sales-rep-only competitions. */
export const usesTiers = (depts = []) => depts.length === 1 && depts[0] === 'sales';
/** Company-wide (more than one department) is always office vs. office. */
export const officesOnly = (depts = []) => depts.length > 1;

/** Points from contract value tiers for one pest sale. */
export function tierPoints(value, tiers = []) {
  return tiers.reduce((sum, t) => sum + (Number(value) > Number(t.over) ? Number(t.pts) || 0 : 0), 0);
}

export const COMPETE_AS = { people: 'Person vs. person', offices: 'Office vs. office', teams: 'Custom teams' };
export const DEPTS = [
  { key: 'technician', label: 'Technicians' },
  { key: 'sales', label: 'Sales' },
  { key: 'administrative', label: 'Office' },
];

const ymd = (d) => String(d).slice(0, 10);

/** 'upcoming' | 'live' | 'final' for a competition on a given day (YYYY-MM-DD). */
export function stageOf(c, today) {
  if (today < ymd(c.start_date)) return 'upcoming';
  if (today > ymd(c.end_date)) return 'final';
  return 'live';
}

/** Whole days from a to b, counting both ends. */
export function daysBetween(a, b) {
  return Math.round((new Date(`${ymd(b)}T12:00:00Z`) - new Date(`${ymd(a)}T12:00:00Z`)) / 86400000) + 1;
}

/** May this person create competitions? Managers and up. */
export const canCreate = (me) => (me?.rank || 0) >= 3;

/** Departments this person may pick: C-Suite and President any, managers only their own. */
export const deptsFor = (me) => ((me?.rank || 0) >= 4 ? DEPTS.map((d) => d.key) : [me?.department]);

/** May this person edit this competition? */
export function canEdit(me, c) {
  if (!me) return false;
  if (me.rank >= 4) return true;
  return me.rank === 3 && c.created_by === me.id && c.departments.length === 1 && c.departments[0] === me.department;
}

/** One person's counts and points, adding up events between from and to (inclusive, YYYY-MM-DD). */
export function scorePeople(board, points, departments, from = null, to = null) {
  const p = { ...DEFAULT_POINTS, ...(points || {}) };
  const live = new Set(kindsFor(departments).map((k) => k.key));
  const blank = { sale: 0, service: 0, autopay: 0, review: 0, bonus: 0, points: 0 };
  const by = new Map((board.members || []).map((m) => [m.id, { ...m, ...blank }]));
  const inWindow = (d) => !((from && d < from) || (to && d > to));
  if (usesTiers(departments)) {
    (board.contracts || []).forEach((c) => {
      const row = by.get(c.e);
      if (!row || !inWindow(ymd(c.d))) return;
      const b = tierPoints(c.v, p.tiers || []);
      row.bonus += b;
      row.points += b;
    });
  }
  (board.events || []).forEach((ev) => {
    if (!inWindow(ymd(ev.d)) || !live.has(ev.k)) return;
    const row = by.get(ev.e);
    if (!row) return;
    row[ev.k] += ev.n;
    row.points += ev.n * (Number(p[ev.k]) || 0);
  });
  return withRanks([...by.values()].sort((a, b) => b.points - a.points || `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)), 'points');
}

/** Groups (offices or teams): total, member count, and average per member. Ranked by average. */
export function scoreGroups(people, by) {
  const groups = new Map();
  people.forEach((r) => {
    const key = by === 'offices' ? r.office || 'none' : r.team;
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, { key, name: by === 'offices' ? OFFICE_NAME[key] || 'No office' : key, members: [], sale: 0, service: 0, autopay: 0, review: 0, bonus: 0, points: 0 });
    }
    const g = groups.get(key);
    g.members.push(r);
    ['sale', 'service', 'autopay', 'review', 'bonus', 'points'].forEach((k) => { g[k] += r[k]; });
  });
  const list = [...groups.values()].map((g) => ({ ...g, avg: g.members.length ? g.points / g.members.length : 0 }));
  return withRanks(list.sort((a, b) => b.avg - a.avg || b.points - a.points || a.name.localeCompare(b.name)), 'avg');
}

/** Same score = same place (1, 2, 2, 4). */
function withRanks(list, field) {
  let rank = 0;
  return list.map((r, i) => {
    if (i === 0 || Math.abs(r[field] - list[i - 1][field]) > 1e-9) rank = i + 1;
    return { ...r, rank };
  });
}

/** 12 → "12", 3.456 → "3.5" */
export const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
