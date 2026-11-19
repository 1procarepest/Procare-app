/**
 * Payroll time off (change 60): who was out in a pay period (or a year), paid vacation vs unpaid, in hours.
 * Pay periods are twice a month: the 1st–15th and the 16th–end of the month.
 * Hours come from each person's usual schedule that day (every-other-week hours included): a full day off is
 * that day's scheduled hours, a part day is the overlap with them. Days they weren't scheduled and company
 * holidays don't count.
 */
import { toMinutes } from './labels';
import { usualShift } from './schedules';
import { holidayLookup } from './holidays';

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The pay period holding ymd: { from, to }. */
export function payPeriod(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return d <= 15
    ? { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-15` }
    : { from: `${y}-${pad(m)}-16`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
}

/** The pay period n periods before (-) or after (+) the one starting on `from`. */
export function shiftPeriod(from, n) {
  let [y, m, d] = from.split('-').map(Number);
  let half = d <= 15 ? 0 : 1;
  let idx = y * 24 + (m - 1) * 2 + half + n;
  y = Math.floor(idx / 24);
  m = Math.floor((idx % 24) / 2) + 1;
  half = idx % 2;
  return payPeriod(`${y}-${pad(m)}-${half ? '16' : '01'}`);
}

function eachDay(from, to) {
  const out = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export const KIND_LABEL = { time_off: 'Time off', sick: 'Sick', called_out: 'Called out' };

/**
 * payroll_data() JSON → one row per person with time off in [from, to]:
 * { p, paidMin, unpaidMin, days, partDays, times, sick, calledOut, entries: [{ id, a, b, kind, pto, note, min, days }] }
 */
export function buildPayroll(data, from, to) {
  const d = data || {};
  const regular = {};
  (d.schedules || []).forEach((s) => { if (s.s && s.x) (regular[s.e] ||= {})[s.d] = [toMinutes(s.s), toMinutes(s.x)]; });
  const alt = {};
  (d.alt || []).forEach((s) => { (alt[s.e] ||= {})[s.d] = s.s && s.x ? [toMinutes(s.s), toMinutes(s.x)] : null; });
  const rot = Object.fromEntries((d.rot || []).map((r) => [r.e, String(r.a).slice(0, 10)]));
  const holiday = holidayLookup(d.holidays);
  const byId = Object.fromEntries((d.people || []).map((p) => [p.id, p]));
  const rows = {};

  (d.off || []).forEach((r) => {
    const p = byId[r.e];
    if (!p) return;
    const row = (rows[r.e] ||= { p, paidMin: 0, unpaidMin: 0, days: 0, partDays: 0, times: 0, sick: 0, calledOut: 0, entries: [] });
    const a = r.a > from ? r.a : from;
    const b = r.b < to ? r.b : to;
    let min = 0;
    let days = 0;
    let part = 0;
    eachDay(a, b).forEach((day) => {
      if (holiday(day)) return;
      const shift = usualShift(regular[r.e], alt[r.e], rot[r.e], day);
      if (r.s && r.x) {
        const [ra, rb] = [toMinutes(r.s), toMinutes(r.x)];
        const m = shift ? Math.max(0, Math.min(rb, shift[1]) - Math.max(ra, shift[0])) : rb - ra;
        if (m > 0) { min += m; part += 1; }
      } else if (shift) {
        min += shift[1] - shift[0];
        days += 1;
      }
    });
    if (!min) return;
    row.times += 1;
    if (r.kind === 'sick') row.sick += 1;
    if (r.kind === 'called_out') row.calledOut += 1;
    if (r.pto) row.paidMin += min; else row.unpaidMin += min;
    row.days += days;
    row.partDays += part;
    row.entries.push({ id: r.id, a, b, s: r.s, x: r.x, kind: r.kind || 'time_off', pto: !!r.pto, note: r.note || '', min, days, part });
  });
  return Object.values(rows).sort((x, y) => (y.paidMin + y.unpaidMin) - (x.paidMin + x.unpaidMin) || x.p.last_name.localeCompare(y.p.last_name));
}

/** Minutes → "7.5 h" (hours to the nearest quarter). */
export const hrs = (min) => `${Math.round((min / 60) * 4) / 4} h`;
