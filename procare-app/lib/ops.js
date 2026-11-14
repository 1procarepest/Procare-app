/** Operations Suite: periods, comparisons and per-office numbers. Raw counts come from ops_suite() and ops_snapshot(). */
import { OFFICE_NAME } from './labels';

// Same order as the old Operations Suite
export const OPS_OFFICES = ['west', 'east', 'south'].map((key) => ({ key, name: OFFICE_NAME[key] }));
export const LINES = [
  { key: 'pest', label: 'General Pest' },
  { key: 'green', label: 'Mosquito Green' },
  { key: 'mosq', label: 'Mosquito' },
  { key: 'termite', label: 'Termite Baiting' },
];
export const SELLERS = ['Sales Reps', 'Technicians', 'Office Staff'];

export const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const toDate = (ymd) => new Date(`${ymd}T12:00:00Z`);
const toYmd = (d) => d.toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return toYmd(d); };
const monthEnd = (y, m) => toYmd(new Date(Date.UTC(y, m, 0, 12))); // m is 1-based
const fmt = (ymd, o) => toDate(ymd).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });

/**
 * The period holding `anchor`, cut off at today, and the stretch it's compared with
 * (day: a week earlier; week, month, year: the one before, same number of days so far).
 */
export function opsRange(view, anchor, today) {
  const a = !anchor || anchor > today ? today : anchor;
  const [y, m] = a.split('-').map(Number);
  let r;
  if (view === 'day') {
    const c = addDays(a, -7);
    r = { from: a, to: a, cFrom: c, cTo: c,
      title: (a === today ? 'Today · ' : '') + fmt(a, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }),
      vs: `vs ${fmt(c, { weekday: 'short', month: 'short', day: 'numeric' })}` };
  } else if (view === 'week') {
    const from = addDays(a, -((toDate(a).getUTCDay() + 6) % 7));
    const to = [addDays(from, 6), today].sort()[0];
    r = { from, to, cFrom: addDays(from, -7), cTo: addDays(to, -7),
      title: `Week of ${fmt(from, { month: 'short', day: 'numeric' })} – ${fmt(addDays(from, 6), { month: 'short', day: 'numeric', year: 'numeric' })}`,
      vs: `vs ${fmt(addDays(from, -7), { month: 'short', day: 'numeric' })}–${fmt(addDays(to, -7), { month: 'short', day: 'numeric' })}` };
  } else if (view === 'month') {
    const from = `${a.slice(0, 7)}-01`;
    const full = monthEnd(y, m);
    const to = [full, today].sort()[0];
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const cFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
    const pEnd = monthEnd(py, pm);
    const cTo = to === full ? pEnd : [addDays(cFrom, Number(to.slice(8)) - 1), pEnd].sort()[0];
    r = { from, to, cFrom, cTo, title: fmt(from, { month: 'long', year: 'numeric' }),
      vs: `vs ${fmt(cFrom, { month: 'short', day: 'numeric' })}–${Number(cTo.slice(8))}` };
  } else {
    const from = `${y}-01-01`;
    const to = [`${y}-12-31`, today].sort()[0];
    const cTo = `${y - 1}${to.slice(4)}`.replace(/-02-29$/, '-02-28');
    r = { from, to, cFrom: `${y - 1}-01-01`, cTo, title: String(y),
      vs: `vs ${fmt(`${y - 1}-01-01`, { month: 'short', day: 'numeric' })} – ${fmt(cTo, { month: 'short', day: 'numeric', year: 'numeric' })}` };
  }
  r.anchor = a;
  r.inProgress = view !== 'day' && r.from <= today && today <= r.to;
  if (r.inProgress) r.title += ' · to date';
  return r;
}

/** One office's (or the total's) numbers for one stretch ('cur' or 'prior'). */
function blank() {
  const lines = {};
  LINES.forEach((l) => { lines[l.key] = { base: 0, callback: 0, partial: 0, incomplete: 0 }; });
  return { services: 0, new_customers: 0, far: 0, other_n: 0, other_far: 0, sources: {}, sellers: {}, cxl: 0, lost: 0,
    reasons: {}, completed: 0, remaining: 0, lines };
}

function add(t, s) {
  ['services', 'new_customers', 'far', 'other_n', 'other_far', 'cxl', 'lost', 'completed', 'remaining'].forEach((k) => { t[k] += s[k]; });
  ['sources', 'reasons'].forEach((k) => Object.entries(s[k]).forEach(([n, v]) => { t[k][n] = (t[k][n] || 0) + v; }));
  Object.entries(s.sellers).forEach(([n, v]) => {
    const x = t.sellers[n] || (t.sellers[n] = { n: 0, far: 0, ap: 0 });
    x.n += v.n; x.far += v.far; x.ap += v.ap;
  });
  Object.entries(s.lines).forEach(([l, v]) => Object.keys(v).forEach((k) => { t.lines[l][k] += v[k]; }));
  return t;
}

/** Reservice rates for a stats object: each kind ÷ regular completed services in the core lines. */
export function reservice(s) {
  const tot = { base: 0, callback: 0, partial: 0, incomplete: 0 };
  Object.values(s.lines).forEach((v) => Object.keys(tot).forEach((k) => { tot[k] += v[k]; }));
  const r = (k, v = tot) => (v.base ? v[k] / v.base : null);
  return {
    base: tot.base,
    callback: r('callback'), partial: r('partial'), incomplete: r('incomplete'),
    all: tot.base ? (tot.callback + tot.partial + tot.incomplete) / tot.base : null,
    byLine: Object.fromEntries(Object.entries(s.lines).map(([l, v]) => [l, { callback: r('callback', v), partial: r('partial', v), incomplete: r('incomplete', v) }])),
  };
}

/** ops_suite() JSON → { east: { cur, prior }, …, total: { cur, prior } } */
export function buildOps(j) {
  const out = {};
  OPS_OFFICES.forEach((o) => { out[o.key] = { cur: blank(), prior: blank() }; });
  const at = (r) => out[r.office]?.[r.w];
  (j?.sales || []).forEach((r) => { const s = at(r); if (s) ['services', 'new_customers', 'far', 'other_n', 'other_far'].forEach((k) => { s[k] = num(r[k]); }); });
  (j?.sources || []).forEach((r) => { const s = at(r); if (s) s.sources[r.label] = num(r.n); });
  (j?.sellers || []).forEach((r) => { const s = at(r); if (s) s.sellers[r.label] = { n: num(r.n), far: num(r.far), ap: num(r.ap) }; });
  (j?.cancels || []).forEach((r) => { const s = at(r); if (s) { s.cxl = num(r.n); s.lost = num(r.far); } });
  (j?.reasons || []).forEach((r) => { const s = at(r); if (s) s.reasons[r.label] = num(r.n); });
  (j?.done || []).forEach((r) => { const s = at(r); if (s) s.completed = num(r.n); });
  (j?.lines || []).forEach((r) => { const s = at(r); if (s && s.lines[r.line]) ['base', 'callback', 'partial', 'incomplete'].forEach((k) => { s.lines[r.line][k] = num(r[k]); }); });
  (j?.remaining || []).forEach((r) => { if (out[r.office]) out[r.office].cur.remaining = num(r.n); });
  out.total = {
    cur: OPS_OFFICES.reduce((t, o) => add(t, out[o.key].cur), blank()),
    prior: OPS_OFFICES.reduce((t, o) => add(t, out[o.key].prior), blank()),
  };
  return out;
}

/** ops_snapshot() JSON → { east: {...}, …, total: {...} } with AR, auto-pay and job pool. */
export function buildSnapshot(j) {
  const out = {};
  const blankSnap = () => ({ ar: 0, cur: 0, d30: 0, d60: 0, d90: 0, accounts: 0, ap_valid: 0, ap_invalid: 0, subs: 0, ap_subs: 0,
    pool: Object.fromEntries(['past', 'this', 'next'].map((b) => [b, { left_core: 0, left_other: 0, scheduled: 0 }])) });
  [...OPS_OFFICES.map((o) => o.key), 'total'].forEach((k) => { out[k] = blankSnap(); });
  const put = (rows, keys) => (rows || []).forEach((r) => {
    if (!out[r.office]) return;
    keys.forEach((k) => { out[r.office][k] = num(r[k]); out.total[k] += num(r[k]); });
  });
  put(j?.ar, ['ar', 'cur', 'd30', 'd60', 'd90']);
  put(j?.accounts, ['accounts', 'ap_valid', 'ap_invalid']);
  put(j?.subs, ['subs', 'ap_subs']);
  (j?.pool || []).forEach((r) => {
    if (!out[r.office] || !out[r.office].pool[r.bucket]) return;
    ['left_core', 'left_other', 'scheduled'].forEach((k) => {
      out[r.office].pool[r.bucket][k] = num(r[k]);
      out.total.pool[r.bucket][k] += num(r[k]);
    });
  });
  out.asOf = j?.as_of || null;
  out.thisMonth = j?.this_month || 'This month';
  out.nextMonth = j?.next_month || 'Next month';
  return out;
}

/** % change, or null when there's nothing to compare with. */
export const change = (cur, prior) => (num(prior) ? (num(cur) - num(prior)) / num(prior) : null);
export const money0 = (n) => '$' + Math.round(num(n)).toLocaleString('en-US');
export const moneyK = (n) => {
  const v = num(n);
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e4) return `$${(v / 1e3).toFixed(1)}K`;
  return money0(v);
};
export const pct1 = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
export const int = (n) => Math.round(num(n)).toLocaleString('en-US');
