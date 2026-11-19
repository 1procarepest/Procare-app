// Route plan: which FieldRoutes route template each technician gets, by office and day.
// Data comes from route_plan_data() (supabase/changes/2026-11-14-28-route-plan.sql).
//
// Rules from the President (2026-11-14):
//   - Everyone starts on "16 Spot Route" (30-minute spots, 9 AM–6 PM) in their home office.
//   - The office changes a tech's usual template per weekday, or one day only, on the page.
//   - Part of a day off: keep the template and block the spots they aren't working.
//   - Sundays are left out. Initials routes are added later in FieldRoutes, not planned here.

import { clock, OFFICE_NAME, toMinutes } from './labels';
import { isBWeek } from './schedules';
import { holidayLookup } from './holidays';

export const DEFAULT_TEMPLATE = '16 Spot Route';
export const PLAN_DAYS = [1, 2, 3, 4, 5, 6]; // Monday … Saturday
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toDate = (ymd) => new Date(`${ymd}T12:00:00Z`);
const toYmd = (d) => d.toISOString().slice(0, 10);
export const addDays = (ymd, n) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return toYmd(d); };
export const weekdayOf = (ymd) => toDate(ymd).getUTCDay();
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(toDate(s).getTime());

/** First and last day of the month that ymd is in. */
export function monthRange(ymd) {
  const d = toDate(ymd);
  const from = toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)));
  const to = toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
  return { from, to };
}
export const shiftMonth = (ymd, n) => {
  const d = toDate(ymd);
  return toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12)));
};
export const monthName = (ymd) => toDate(ymd).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const monthKey = (ymd) => `${String(ymd).slice(0, 7)}-01`;

/** The range asked for in the address, or next month. At most 62 days. */
export function planRange(from, to, today) {
  if (isYmd(from) && isYmd(to) && to >= from && (toDate(to) - toDate(from)) / 86400000 <= 62) return { from, to };
  if (isYmd(from)) return monthRange(from);
  return monthRange(shiftMonth(today, 1));
}

/** Days from..to with Sundays left out. */
export function planDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (weekdayOf(d) !== 0) out.push(d);
  return out;
}

/** "Tuesday 12/1" like Route Builder. */
export function dayLabel(ymd) {
  const d = toDate(ymd);
  return `${DAY_LONG[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
const shortDay = (ymd) => { const d = toDate(ymd); return `${DAY_SHORT[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const md = (ymd) => { const d = toDate(ymd); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

export const techName = (t) => `${t.first || ''} ${(t.last || '').trim().charAt(0)}`.trim();

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const span = ([a, b]) => `${clock(hhmm(a))}–${clock(hhmm(b))}`;

/**
 * The hours a template covers, in minutes from midnight, or null when the name doesn't say.
 * "16 Spot Route" is 9–6. Otherwise reads a time range in the name: "9:30-5:30", "8am-5pm",
 * "8-4PM Route", "ZACH ROUTE 8-6:30", "Moriah 8:30-4 Route". Hours before 7 without AM/PM are PM.
 */
export function templateWindow(name) {
  const s = String(name || '');
  if (/16\s*spot/i.test(s)) return [540, 1080];
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  const part = (h, min, ap, isEnd, start) => {
    let hr = Number(h);
    const a = (ap || '').toLowerCase();
    if (a === 'pm' && hr < 12) hr += 12;
    else if (a === 'am' && hr === 12) hr = 0;
    else if (!a && hr < 7) hr += 12;
    let v = hr * 60 + Number(min || 0);
    if (isEnd && v <= start && v + 720 <= 1440) v += 720;
    return v;
  };
  const a = part(m[1], m[2], m[3], false);
  const b = part(m[4], m[5], m[6], true, a);
  if (a >= b || b > 1440) return null;
  return [a, b];
}

/** Intervals minus one interval. */
function cut(list, [c0, c1]) {
  const out = [];
  list.forEach(([a, b]) => {
    if (c1 <= a || c0 >= b) { out.push([a, b]); return; }
    if (a < c0) out.push([a, c0]);
    if (c1 < b) out.push([c1, b]);
  });
  return out;
}

/** Lookups built once from route_plan_data(). */
export function indexData(data) {
  const d = data || {};
  const techs = d.techs || [];
  const byId = Object.fromEntries(techs.map((t) => [t.id, t]));
  const sched = {};
  (d.schedules || []).forEach((s) => { sched[`${s.id}|${s.wd}`] = [toMinutes(s.s), toMinutes(s.e)]; });
  // Every-other-week hours (change 54): B-week hours by tech and weekday (null = off), and each tech's week A
  const alt = {};
  (d.alt || []).forEach((s) => { alt[`${s.id}|${s.wd}`] = s.s && s.e ? [toMinutes(s.s), toMinutes(s.e)] : null; });
  const rot = Object.fromEntries((d.rot || []).map((r) => [r.id, String(r.a).slice(0, 10)]));
  const usual = {};
  (d.usual || []).forEach((u) => { usual[`${u.id}|${u.wd}`] = u; });
  const days = {};
  (d.days || []).forEach((x) => { days[`${x.id}|${x.day}`] = x; });
  const timeoff = {};
  (d.timeoff || []).forEach((t) => { (timeoff[t.id] ||= []).push(t); });
  const templates = {};
  (d.templates || []).forEach((t) => { (templates[t.office] ||= []).push(t); });
  Object.keys(templates).forEach((k) => templates[k].sort((a, b) => b.n - a.n || a.title.localeCompare(b.title)));
  // Company holidays (change 57): techs aren't routed on one unless someone adds a one-day route for them
  const holiday = holidayLookup(d.holidays);
  return { techs, byId, sched, alt, rot, usual, days, timeoff, templates, holiday, builds: d.builds || [], changes: d.changes || [] };
}

/** Template names for an office's pick list: 16 Spot Route first, then what FieldRoutes uses most. */
export function templateNames(ix, office) {
  const names = [DEFAULT_TEMPLATE, ...(ix.templates[office] || []).map((t) => t.title)];
  return [...new Set(names.map((n) => n.trim()))];
}

/** Where and on what a tech routes on a day: one-day change, else usual for the weekday, else default. */
export function assignment(ix, tech, day) {
  const wd = weekdayOf(day);
  const one = ix.days[`${tech.id}|${day}`];
  const usual = ix.usual[`${tech.id}|${wd}`];
  return {
    template: one?.template || usual?.template || DEFAULT_TEMPLATE,
    office: one?.office || usual?.office || tech.office,
    oneDay: !!one,
  };
}

/**
 * One office's plan: for each day, routes grouped by template, plus who's off on time off.
 * Each route: { id, name, hours: [a, b] | null, work: [[a, b]…], blocks: [[a, b]…], note }.
 */
export function buildPlan(ix, office, from, to) {
  return planDays(from, to).map((day) => {
    const wd = weekdayOf(day);
    const groups = {};
    const off = [];
    const holiday = ix.holiday ? ix.holiday(day) : null;
    ix.techs.forEach((t) => {
      const a = assignment(ix, t, day);
      if (a.office !== office) return;
      if (holiday && !a.oneDay) return;
      const altKey = `${t.id}|${wd}`;
      const shift = isBWeek(ix.rot?.[t.id], day) && ix.alt && altKey in ix.alt ? (ix.alt[altKey] || undefined) : ix.sched[`${t.id}|${wd}`];
      const offs = (ix.timeoff[t.id] || []).filter((o) => o.from <= day && o.to >= day);
      if (!shift && !a.oneDay) return;
      if (offs.some((o) => !o.s)) { off.push(techName(t)); return; }
      let work = shift ? [shift] : [];
      offs.forEach((o) => { work = cut(work, [toMinutes(o.s), toMinutes(o.e)]); });
      if (shift && !work.length) { off.push(techName(t)); return; }
      const win = templateWindow(a.template);
      let blocks = [];
      if (win && work.length) {
        blocks = [win];
        work.forEach((w) => { blocks = cut(blocks, w); });
      }
      const route = {
        id: t.id,
        name: techName(t),
        work,
        blocks,
        partial: offs.length > 0,
        note: shift ? '' : 'not on their schedule this day',
      };
      (groups[a.template] ||= []).push(route);
    });
    const order = Object.keys(groups).sort((x, y) => (x === DEFAULT_TEMPLATE ? -1 : y === DEFAULT_TEMPLATE ? 1 : x.localeCompare(y)));
    order.forEach((k) => groups[k].sort((x, y) => x.name.localeCompare(y.name)));
    return { day, holiday, groups: order.map((k) => ({ template: k, routes: groups[k] })), off: off.sort() };
  });
}

/** One route as a line: "Shellie B · 9 AM–1 PM · block 1 PM–6 PM". Full normal days are just the name. */
export function routeLine(r, template) {
  const parts = [r.name];
  const win = templateWindow(template);
  const fullDay = win && r.work.length === 1 && r.work[0][0] === win[0] && r.work[0][1] === win[1];
  if (r.work.length && !fullDay) parts.push(r.work.map(span).join(', '));
  if (r.blocks.length) parts.push(`block ${r.blocks.map(span).join(', ')}`);
  if (r.partial) parts.push('part day off');
  if (r.note) parts.push(r.note);
  return parts.join(' · ');
}

export function dayText(d) {
  const lines = [dayLabel(d.day) + (d.holiday ? ` (${d.holiday}, company holiday)` : '')];
  if (!d.groups.length) lines.push('  No routes');
  d.groups.forEach((g) => {
    lines.push(`  ${g.template} (${g.routes.length})`);
    g.routes.forEach((r) => lines.push(`    ${routeLine(r, g.template)}`));
  });
  if (d.off.length) lines.push(`  Time off: ${d.off.join(', ')}`);
  return lines.join('\n');
}

export function planText(plan, office, from, to) {
  const head = [
    `${OFFICE_NAME[office] || office} · Route plan ${md(from)}–${md(to)} (Sundays left out)`,
    `Everyone on ${DEFAULT_TEMPLATE} unless listed under another template. "block" = block those spots in Route Builder.`,
  ];
  return [...head, '', ...plan.map(dayText).flatMap((t) => [t, ''])].join('\n').trim();
}

// ---------- Changes after a month was built ----------

const shiftText = (s) => (s && s.start_time ? span([toMinutes(s.start_time), toMinutes(s.end_time)]) : 'off');
const offDates = (t) => {
  const dates = t.start_date === t.end_date ? shortDay(t.start_date) : `${shortDay(t.start_date)}–${shortDay(t.end_date)}`;
  return t.start_time ? `${dates} ${span([toMinutes(t.start_time), toMinutes(t.end_time)])}` : `${dates} (all day)`;
};

/**
 * Schedule edits and time off decisions after an office's month was built, that touch that office's
 * routes in that month. Returns [{ at, by, text }] oldest first.
 */
export function changesSince(ix, build, from, to) {
  const { from: mFrom, to: mTo } = monthRange(build.month);
  const start = from > mFrom ? from : mFrom;
  const end = to < mTo ? to : mTo;
  const days = planDays(start, end);
  // Techs who route in this office on some day of the month
  const inOffice = (t) => days.some((d) => assignment(ix, t, d).office === build.office);
  const out = [];
  ix.changes.forEach((c) => {
    if (c.at <= build.at) return;
    const t = ix.byId[c.id];
    if (!t || !inOffice(t)) return;
    const name = techName(t);
    if (c.table === 'schedules') {
      const wd = (c.after || c.before)?.weekday;
      if (!wd) return; // Sundays aren't routed
      const was = shiftText(c.before);
      const now = c.action === 'delete' ? 'off' : shiftText(c.after);
      if (was === now) return;
      out.push({ at: c.at, by: c.by, text: `${name}: every ${DAY_LONG[wd]} now ${now} (was ${was})` });
      return;
    }
    // Time off
    const b = c.before;
    const a = c.action === 'delete' ? null : c.after;
    const touches = (t2) => t2 && t2.start_date <= end && t2.end_date >= start;
    const same = a && b && a.start_date === b.start_date && a.end_date === b.end_date && a.start_time === b.start_time && a.end_time === b.end_time;
    const nowOn = a?.status === 'approved';
    const wasOn = b?.status === 'approved';
    if (nowOn && (!wasOn || !same) && touches(a)) {
      out.push({ at: c.at, by: c.by, text: `${name}: time off approved ${offDates(a)}${wasOn ? ` (changed from ${offDates(b)})` : ''}` });
    } else if (wasOn && touches(b) && !(nowOn && touches(a))) {
      const what = nowOn ? `moved to ${offDates(a)}` : a ? a.status : 'removed';
      out.push({ at: c.at, by: c.by, text: `${name}: time off ${offDates(b)} ${what} — they’re working those hours again` });
    }
  });
  return out;
}
