import { clock, fromMinutes, toMinutes } from './labels';

/** Who may open the team schedule (matches team_schedule_depts() in the database). */
export const canSeeTeamSchedule = (me) => me && (me.rank >= 3 || me.department === 'sales');

/**
 * One person's day: their usual hours minus approved time off; requested time off is flagged.
 * shift = [startMin, endMin] or undefined; off = their time-off rows ({ a, b, s, x, st }).
 */
export function dayFor(shift, off, ymd) {
  const hits = off.filter((r) => r.a <= ymd && r.b >= ymd);
  const approved = hits.filter((r) => r.st === 'approved');
  const pending = hits.filter((r) => r.st === 'pending');
  if (approved.some((r) => !r.s)) return { working: false, text: 'Time off', kind: 'off' };
  let pieces = shift ? [shift] : [];
  approved.forEach((r) => {
    const [a, b] = [toMinutes(r.s), toMinutes(r.x)];
    pieces = pieces.flatMap(([x, y]) => [[x, Math.min(y, a)], [Math.max(x, b), y]].filter(([p, q]) => q > p));
  });
  if (shift && !pieces.length) return { working: false, text: 'Time off', kind: 'off' };
  const text = pieces.map(([x, y]) => `${clock(fromMinutes(x))}–${clock(fromMinutes(y))}`).join(', ');
  const ask = pending.find((r) => !r.s) || pending[0];
  return {
    working: pieces.length > 0,
    start: pieces[0]?.[0] ?? null,
    text: pieces.length ? text : 'Off',
    kind: pieces.length ? (approved.length ? 'part' : 'on') : 'none',
    requested: ask ? (ask.s ? `asked off ${clock(ask.s)}–${clock(ask.x)}` : 'asked for the day off') : null,
  };
}
