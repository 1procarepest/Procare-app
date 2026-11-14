/** Sales Rep Cards: periods, per-rep numbers and leaders. The raw counts come from rep_cards() in Supabase. */

export const VIEWS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

// Door outcomes in FieldRoutes, in the order the cards list them
export const OUTCOMES = [
  { key: 'made_sale', label: 'Made Sale', note: 'High Priority', color: '#4E9A3A' },
  { key: 'call_back', label: 'Call Back', note: 'Medium Priority', color: '#6A2BB0' },
  { key: 'gave_pitch', label: 'Gave Pitch', note: 'Low Priority', color: '#3A78D4' },
  { key: 'not_interested', label: 'Not Interested', note: 'Turned Down Offer', color: '#C8372D' },
  { key: 'not_home', label: 'Not Home', note: '', color: '#5B5F60' },
  { key: 'never_knock', label: 'Never Knock', note: 'Hostile', color: '#111111' },
];

export const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
export const ratio = (a, b) => (num(b) ? num(a) / num(b) : null);
export const pct0 = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
export const one = (v) => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toFixed(1));
export const money0 = (n) => '$' + Math.round(num(n)).toLocaleString('en-US');

/* ---------- dates (all plain "YYYY-MM-DD", Atlanta calendar) ---------- */

export function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
const toDate = (ymd) => new Date(`${ymd}T12:00:00Z`);
const toYmd = (d) => d.toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return toYmd(d); };

/** First and last day of the day / week (Mon–Sun) / month / year holding `ymd`. */
export function periodRange(view, ymd) {
  const d = toDate(ymd);
  if (view === 'day') return { from: ymd, to: ymd };
  if (view === 'month') {
    const from = `${ymd.slice(0, 7)}-01`;
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    return { from, to: toYmd(end) };
  }
  if (view === 'year') return { from: `${ymd.slice(0, 4)}-01-01`, to: `${ymd.slice(0, 4)}-12-31` };
  const from = addDays(ymd, -((d.getUTCDay() + 6) % 7));
  return { from, to: addDays(from, 6) };
}

/** The same kind of period, `step` periods earlier (-1) or later (+1). Returns a date inside it. */
export function shiftPeriod(view, ymd, step) {
  const { from } = periodRange(view, ymd);
  if (view === 'day') return addDays(from, step);
  if (view === 'week') return addDays(from, 7 * step);
  const d = toDate(from);
  if (view === 'month') return toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1, 12)));
  return `${d.getUTCFullYear() + step}-01-01`;
}

/** "Nov 9 – Nov 15, 2026", "November 2026", "2026", "Sat, Nov 14, 2026" */
export function periodLabel(view, { from, to }) {
  const f = toDate(from), t = toDate(to);
  const opt = (o) => ({ timeZone: 'UTC', ...o });
  if (view === 'day') return f.toLocaleDateString('en-US', opt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
  if (view === 'month') return f.toLocaleDateString('en-US', opt({ month: 'long', year: 'numeric' }));
  if (view === 'year') return String(f.getUTCFullYear());
  const md = (x) => x.toLocaleDateString('en-US', opt({ month: 'short', day: 'numeric' }));
  return `${md(f)} – ${md(t)}, ${t.getUTCFullYear()}`;
}

export const LEADER_TITLE = { day: 'Today’s leaders', week: 'This week’s leaders', month: 'This month’s leaders', year: 'This year’s leaders' };

/* ---------- numbers ---------- */

/** Everything a card or total shows, from one row (or a sum of rows) of rep_cards(). */
export function measure(r) {
  const m = {};
  ['doors', 'convos', 'info', 'hours', 'field_days', 'services', 'pest', 'termite', 'mosquito', 'new_customers', 'autopay',
    'serviced', 'pending', 'due', 'canceled', 'far', 'cv_pest', 'cv_termite', 'cv_mosquito', 'reps',
    ...OUTCOMES.map((o) => o.key)].forEach((k) => { m[k] = num(r?.[k]); });
  m.closeRate = ratio(m.new_customers, m.convos);        // new customers ÷ conversations
  m.contactRate = ratio(m.convos, m.doors);
  m.infoRate = ratio(m.info, m.doors);
  m.doorsPerHour = m.hours ? m.doors / m.hours : null;
  m.autopayRate = ratio(m.autopay, m.new_customers);
  m.dueBase = m.serviced + m.due + m.canceled;             // sales whose first service should have happened
  m.saleToService = ratio(m.serviced, m.dueBase);
  m.farPerService = ratio(m.far, m.services);
  m.avgPest = ratio(m.cv_pest, m.pest);
  m.avgTermite = ratio(m.cv_termite, m.termite);
  m.avgMosquito = ratio(m.cv_mosquito, m.mosquito);
  return m;
}

/** Highest services sold first, then new customers, then doors. */
export const byStanding = (a, b) => b.m.services - a.m.services || b.m.new_customers - a.m.new_customers || b.m.doors - a.m.doors || a.name.localeCompare(b.name);

export const LEADERS = [
  { key: 'services', title: 'Most services', value: (m) => m.services, show: (v) => v, sub: 'services sold' },
  { key: 'new', title: 'Most new customers', value: (m) => m.new_customers, show: (v) => v, sub: 'new customers' },
  { key: 'convos', title: 'Most conversations', value: (m) => m.convos, show: (v) => v, sub: 'conversations' },
  { key: 'hours', title: 'Most hours', value: (m) => m.hours, show: one, sub: 'hours' },
  { key: 'close', title: 'Top closer', value: (m) => (m.convos >= 10 ? m.closeRate : null), show: pct0, sub: 'close rate · 10+ convos' },
  { key: 'cv', title: 'Top avg 1st year pest CV', value: (m) => (m.pest >= 2 ? m.avgPest : null), show: money0, sub: 'avg pest CV · 2+ pest sales' },
  { key: 'far', title: 'Most future annual revenue', value: (m) => m.far, show: money0, sub: 'future annual revenue' },
  { key: 's2s', title: 'Best sales to service', value: (m) => (m.dueBase >= 3 ? m.saleToService : null), show: pct0, sub: 'serviced · 3+ due' },
  { key: 'info', title: 'Most customer info', value: (m) => m.info, show: (v) => v, sub: 'names / phones / emails' },
  { key: 'pace', title: 'Fastest pace', value: (m) => (m.hours >= 1 ? m.doorsPerHour : null), show: one, sub: 'doors / hr · 1+ hour' },
  { key: 'doors', title: 'Most doors', value: (m) => m.doors, show: (v) => v, sub: 'doors' },
];

/** The top rep for each leader board (skips boards nobody has a number on). */
export function leaders(reps) {
  return LEADERS.map((L) => {
    let best = null;
    reps.forEach((r) => {
      const v = L.value(r.m);
      if (v === null || v === undefined || !(v > 0)) return;
      if (!best || v > best.v || (v === best.v && byStanding(r, best.r) < 0)) best = { r, v };
    });
    return best ? { ...L, rep: best.r, v: best.v } : null;
  }).filter(Boolean);
}

/** Week of `ymd` (Monday) for each of the 52 weeks ending with the week holding `to`. */
function weekStarts(to) {
  const last = periodRange('week', to).from;
  return Array.from({ length: 52 }, (_, i) => addDays(last, -7 * (51 - i)));
}

/**
 * Turns rep_cards() rows into what the page draws:
 *   reps:    [{ id, name, first_name, last_name, office, photo, m, weeks }] ranked, with rank set
 *   offices: { east: m, west: m, south: m }, team: m (all offices)
 * Weeks start at the rep's first week with any activity in the last 52.
 */
export function buildCards(rows, to) {
  const reps = {}, weekRows = {}, offices = {};
  let team = measure({});
  (rows || []).forEach((r) => {
    if (r.kind === 'rep') {
      reps[r.employee_id] = {
        id: r.employee_id, first_name: r.first_name, last_name: r.last_name,
        name: `${r.first_name || ''} ${r.last_name || ''}`.replace(/\s+/g, ' ').trim(),
        office: r.home_office, photo: r.photo_url, m: measure(r),
      };
    } else if (r.kind === 'week') {
      (weekRows[r.employee_id] ||= {})[String(r.week).slice(0, 10)] = r;
    } else if (r.kind === 'office') {
      offices[r.office] = measure(r);
    } else if (r.kind === 'team') {
      team = measure(r);
    }
  });
  const starts = weekStarts(to);
  const list = Object.values(reps);
  list.forEach((rep) => {
    const mine = weekRows[rep.id] || {};
    const first = starts.findIndex((w) => mine[w]);
    rep.weeks = first < 0 ? [] : starts.slice(first).map((w) => ({ week: w, m: measure(mine[w]) }));
  });
  list.sort(byStanding).forEach((r, i) => { r.rank = i + 1; });
  return { reps: list, offices, team };
}
