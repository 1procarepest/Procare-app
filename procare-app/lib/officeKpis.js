/**
 * Office KPI competitions: offices compete on rates (so office size doesn't matter), scored by place
 * (1st 3 × weight, 2nd 2 × weight, 3rd 1 × weight) or by goal (points for hitting it). Settings live in
 * competitions.points.kpis; numbers come from office_kpi_board().
 */
const pct = (n, d) => (d ? (100 * n) / d : null);

export const OFFICE_KPIS = [
  { key: 'sales', label: 'Sales', unit: 'per 100 customers', better: 'high', goal: 4, bug: 'spider',
    hint: 'New core sales in the period per 100 recurring customers (customers at the start).',
    value: (o) => pct(o.sales, o.accounts_start ?? o.accounts) },
  { key: 'autopay', label: 'Auto-pay', unit: '% of customers', better: 'high', goal: 70, bug: 'ant',
    hint: 'Recurring customers on valid auto-pay, as of the end.',
    value: (o) => pct(o.ap_valid, o.accounts) },
  { key: 'ar', label: 'Accounts receivable', unit: '% past due 30+', better: 'low', goal: 70, bug: 'tick',
    hint: 'Share of AR that is 30 or more days past due, as of the end. Lower is better.',
    value: (o) => (o.ar_past_pct === null || o.ar_past_pct === undefined ? null : Number(o.ar_past_pct)) },
  { key: 'pool', label: 'Job pool', unit: '% past due', better: 'low', goal: 3, bug: 'termite',
    hint: 'Past-due jobs not on the schedule, as a share of recurring customers, as of the end. Lower is better.',
    value: (o) => pct(o.pool_past, o.accounts) },
  { key: 'cancel', label: 'Retention', unit: '% canceled', better: 'low', goal: 1, bug: 'roach',
    hint: 'Core cancellations in the period ÷ recurring customers at the start. Lower is better.',
    value: (o) => pct(o.cancels, o.accounts_start ?? o.accounts) },
];

export const PLACE_PTS = [3, 2, 1];

export function defaultKpis() {
  return Object.fromEntries(OFFICE_KPIS.map((k) => [k.key, { on: true, mode: 'place', pts: 1, goal: k.goal }]));
}

export function kpiSettings(points) {
  const d = defaultKpis();
  const saved = points?.kpis || {};
  return Object.fromEntries(OFFICE_KPIS.map((k) => [k.key, { ...d[k.key], ...(saved[k.key] || {}) }]));
}

const hitGoal = (k, v, goal) => (v === null ? false : k.better === 'high' ? v >= Number(goal) : v < Number(goal));

/** Each office's value, place, goal and points for every KPI that's on, plus its total and rank. */
export function scoreOffices(rows, points) {
  const cfg = kpiSettings(points);
  const on = OFFICE_KPIS.filter((k) => cfg[k.key].on);
  const out = rows.map((o) => ({ office: o.office, raw: o, kpis: {}, total: 0 }));
  on.forEach((k) => {
    const c = cfg[k.key];
    const vals = out.map((r) => ({ r, v: k.value(r.raw) }));
    const ranked = vals.filter((x) => x.v !== null).sort((a, b) => (k.better === 'high' ? b.v - a.v : a.v - b.v));
    vals.forEach(({ r, v }) => {
      let place = null;
      if (v !== null) place = 1 + ranked.filter((x) => (k.better === 'high' ? x.v > v + 1e-9 : x.v < v - 1e-9)).length;
      const hit = c.mode === 'goal' ? hitGoal(k, v, c.goal) : null;
      const earned = v === null ? 0
        : c.mode === 'goal' ? (hit ? Number(c.pts) || 0 : 0)
          : (PLACE_PTS[place - 1] || 0) * (Number(c.pts) || 0);
      r.kpis[k.key] = { v, place, hit, pts: earned };
      r.total += earned;
    });
  });
  out.sort((a, b) => b.total - a.total || a.office.localeCompare(b.office));
  let rank = 0;
  out.forEach((r, i) => { if (i === 0 || r.total !== out[i - 1].total) rank = i + 1; r.rank = rank; });
  return { offices: out, on, cfg };
}

/** 3.456 → "3.5" */
export const kfmt = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(Math.abs(v) < 10 ? 2 : 1).replace(/\.?0+$/, ''));
