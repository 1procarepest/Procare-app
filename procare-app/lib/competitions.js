import { OFFICE_NAME } from './labels';

/** What earns points. Values are set per competition; these are the starting defaults. */
export const KINDS = [
  { key: 'sale', label: 'Sale serviced', short: 'Sales', hint: 'A rep’s sale gets its first service done (credited to the rep who sold it).', dept: 'sales', def: 3 },
  { key: 'autopay', label: 'Auto-pay turned on', short: 'Auto-pay', hint: 'A customer turns on auto-pay the day a tech services them (credited to that tech).', dept: 'technician', def: 2 },
  { key: 'review', label: 'Review', short: 'Reviews', hint: 'A review with enough stars (credited to the tech on that visit).', dept: 'technician', def: 1 },
];
export const DEFAULT_POINTS = { sale: 3, autopay: 2, review: 1, review_stars: 5 };
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
export function scorePeople(board, points, from = null, to = null) {
  const p = { ...DEFAULT_POINTS, ...(points || {}) };
  const by = new Map((board.members || []).map((m) => [m.id, { ...m, sale: 0, autopay: 0, review: 0, points: 0 }]));
  (board.events || []).forEach((ev) => {
    const d = ymd(ev.d);
    if ((from && d < from) || (to && d > to)) return;
    const row = by.get(ev.e);
    if (!row || !(ev.k in row)) return;
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
      groups.set(key, { key, name: by === 'offices' ? OFFICE_NAME[key] || 'No office' : key, members: [], sale: 0, autopay: 0, review: 0, points: 0 });
    }
    const g = groups.get(key);
    g.members.push(r);
    g.sale += r.sale; g.autopay += r.autopay; g.review += r.review; g.points += r.points;
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
