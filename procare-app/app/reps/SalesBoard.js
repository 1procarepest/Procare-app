'use client';

import Link from 'next/link';
import { useState } from 'react';
import Face from '../Face';
import Bug from '../Bug';
import { OFFICE_NAME } from '@/lib/labels';
import { money0, num } from '@/lib/repcards';

const BOARD_OFFICES = ['east', 'south', 'west'];
const pct = (a, b) => (num(b) ? `${((num(a) / num(b)) * 100).toFixed(1)}%` : '—');
const money2 = (n) => (n === null || n === undefined ? '—' : '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const day = (ymd) => (ymd ? `${Number(String(ymd).slice(5, 7))}/${Number(String(ymd).slice(8, 10))}` : '—');
const hour = (h) => (h === null || h === undefined ? '—' : `${num(h) % 12 || 12} ${num(h) < 12 ? 'AM' : 'PM'}`);
const avg = (a, b) => (num(b) ? (num(a) / num(b)).toFixed(2) : '—');

// Columns: [key, label, value for sorting, how it shows]
const COLS = [
  ['sold', 'Sold', (r) => num(r.sold), (r) => <strong>{r.sold}</strong>],
  ['serviced', 'Serviced', (r) => num(r.serviced), (r) => r.serviced],
  ['servPct', 'Serviced %', (r) => num(r.serviced) / num(r.sold), (r) => pct(r.serviced, r.sold)],
  ['active', 'Active', (r) => num(r.active), (r) => r.active],
  ['days', 'Selling days', (r) => num(r.selling_days), (r) => r.selling_days],
  ['daily', 'Daily avg', (r) => (num(r.selling_days) ? num(r.sold) / num(r.selling_days) : 0), (r) => avg(r.sold, r.selling_days)],
  ['avgInit', 'Avg initial', (r) => num(r.avg_init), (r) => money2(r.avg_init)],
  ['avgServInit', 'Avg serviced initial', (r) => num(r.avg_serv_init), (r) => money2(r.avg_serv_init)],
  ['avgContract', 'Avg contract', (r) => num(r.avg_contract), (r) => money2(r.avg_contract)],
  ['avgServContract', 'Avg serviced contract', (r) => num(r.avg_serv_contract), (r) => money2(r.avg_serv_contract)],
  ['totServContract', 'Total serviced contract', (r) => num(r.total_serv_contract), (r) => money2(r.total_serv_contract)],
  ['revenue', 'Total revenue', (r) => num(r.total_revenue), (r) => money2(r.total_revenue)],
  ['avgArv', 'Avg annual recurring', (r) => num(r.avg_arv), (r) => money2(r.avg_arv)],
  ['totArv', 'Total annual recurring', (r) => num(r.total_arv), (r) => money2(r.total_arv)],
  ['ap', 'Auto-pay %', (r) => num(r.ap) / num(r.sold), (r) => pct(r.ap, r.sold)],
  ['servAp', 'Serviced auto-pay', (r) => (num(r.serviced) ? num(r.serv_ap) / num(r.serviced) : -1), (r) => `${pct(r.serv_ap, r.serviced)} · ${r.serv_ap}/${r.serviced}`],
  ['bad', 'Bad payment methods', (r) => num(r.bad_pay), (r) => (num(r.bad_pay) ? <span className="ops-bad">{r.bad_pay}</span> : 0)],
  ['best', 'Best day', (r) => num(r.best_day_sold), (r) => `${day(r.best_day)} · ${r.best_day_sold}`],
  ['hour', 'Power hour', (r) => -num(r.power_hour), (r) => hour(r.power_hour)],
  ['knocks', 'Knocks', (r) => num(r.knocks), (r) => r.knocks],
];

// Extra columns for the first-service-date view
const STATUS_COLS = [
  ['pending', 'Pending', (r) => num(r.pending), (r) => r.pending],
  ['notServiced', 'Not serviced', (r) => num(r.not_serviced), (r) => r.not_serviced],
  ['canceled', 'Canceled', (r) => num(r.canceled), (r) => r.canceled],
];

function Summary({ t, byService }) {
  const rows = [
    ['Total serviced', num(t.serviced)],
    ['Serviced percent', pct(t.serviced, t.sold)],
    ['Currently active', num(t.active)],
    [byService ? 'Total first services' : 'Total sales', num(t.sold)],
    ...(byService ? [['Pending', num(t.pending)], ['Not serviced', num(t.not_serviced)], ['Canceled', num(t.canceled)]] : []),
    ['Selling days', num(t.selling_days)],
    ['Daily average', avg(t.sold, t.selling_days)],
    ['Average serviced initial', money2(t.avg_serv_init)],
    ['Total revenue', money0(t.total_revenue)],
    ['Auto-pay', pct(t.ap, t.sold)],
  ];
  return (
    <dl className="sb-summary">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

export default function SalesBoard({ data, office, label, onOffice, basis = 'sold', basisLinks = {} }) {
  const [sort, setSort] = useState({ key: 'sold', dir: -1 });
  const reps = (data?.reps || []).filter((r) => office === 'all' || r.office === office);
  const offices = Object.fromEntries((data?.offices || []).map((o) => [o.office, o]));
  const total = office === 'all' ? (data?.team || {}) : (offices[office] || {});
  const byService = basis === 'service';
  const cols = byService
    ? [['sold', 'Sales', COLS[0][2], COLS[0][3]], COLS[1], ...STATUS_COLS, ...COLS.slice(2).filter((c) => c[0] !== 'active')]
    : COLS;
  const col = cols.find((c) => c[0] === sort.key) || cols[0];
  const sorted = [...reps].sort((a, b) => (col[2](a) - col[2](b)) * sort.dir || num(b.sold) - num(a.sold) || String(a.name).localeCompare(b.name));
  const tiles = [['all', 'Total', data?.team?.sold], ...BOARD_OFFICES.map((k) => [k, OFFICE_NAME[k], offices[k]?.sold])];

  return (
    <>
      <div className="sb-basis">
        <span className="rc-label">Count sales by</span>
        <nav className="rc-seg" aria-label="Count sales by">
          <Link href={basisLinks.sold || '#'} className={!byService ? 'on' : ''} aria-current={!byService ? 'page' : undefined} scroll={false}>Sold date</Link>
          <Link href={basisLinks.service || '#'} className={byService ? 'on' : ''} aria-current={byService ? 'page' : undefined} scroll={false}>First-service date</Link>
        </nav>
        <span className="sb-basis-note">{byService
          ? 'Like FieldRoutes’ Sales Report: sales whose first service is scheduled in this period, every status, current and former reps.'
          : 'Like FieldRoutes’ Sales Leaderboard: sales made in this period that are pending or serviced, current reps.'}</span>
      </div>

      <div className="sb-tiles">
        {tiles.map(([k, name, n], i) => (
          <button type="button" key={k} className={`sb-tile${office === k ? ' on' : ''}`} onClick={() => onOffice?.(k)} aria-pressed={office === k}>
            <Bug kind={['ant', 'spider', 'stinging', 'mosquito'][i]} size={60} className="sb-tile-bug" />
            <span className="sb-tile-name">{name}</span>
            <span className="sb-tile-n">{num(n)}</span>
            <span className="sb-tile-sub">{byService ? 'first services' : 'sold'}</span>
          </button>
        ))}
      </div>

      <div className="sb-layout">
        <section className="rc-panel sb-roster">
          <div className="sb-head"><h2>Roster</h2><span className="rc-label">Click a column to sort</span></div>
          {sorted.length ? (
            <div className="sb-table-wrap">
              <table className="sb-table">
                <thead>
                  <tr>
                    <th className="sb-sticky">#</th>
                    <th className="sb-sticky sb-name">Salesperson</th>
                    {cols.map(([k, l]) => (
                      <th key={k} aria-sort={sort.key === k ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}>
                        <button type="button" className="sort" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : -1 }))}>
                          {l}{sort.key === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.who}>
                      <td className="sb-sticky sb-rank">{i + 1}</td>
                      <th scope="row" className="sb-sticky sb-name">
                        <span className="sb-who">
                          <Face person={{ photo_url: r.photo_url, first_name: r.name?.split(' ')[0], last_name: r.name?.split(' ').slice(-1)[0] }} size={32} />
                          <span><span className="sb-who-name">{r.name}</span><span className="sb-who-sub">{OFFICE_NAME[r.office] || '—'}</span></span>
                        </span>
                      </th>
                      {cols.map(([k, , , show]) => <td key={k}>{show(r)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="note">No sales in this period yet.</p>}
        </section>

        <aside className="rc-panel sb-side">
          <div className="sb-head"><h2>{office === 'all' ? 'Procare' : OFFICE_NAME[office]}</h2><span className="rc-label">{label}</span></div>
          <Summary t={total} byService={byService} />
        </aside>
      </div>

      <details className="glossary spaced">
        <summary><h2>How this matches FieldRoutes</h2></summary>
        <dl>
          <div className="gl-row"><dt>Two ways to count</dt><dd>Sold date matches FieldRoutes’ Sales Leaderboard and is what competitions use. First-service date matches FieldRoutes’ Sales Report (“Scheduled Between”), which is closer to what pays, since a sale pays once its first service is done. The two only agree on sales sold and serviced in the same period. In the first-service view, not-serviced and canceled sales only show when the app has their first appointment; most cancelled appointments aren’t copied from FieldRoutes yet.</dd></div>
          <div className="gl-row"><dt>Same filters</dt><dd>Sold subscriptions, credited to the first salesperson on the day the account was sold, whose first service is Pending or Serviced (no-shows, cancels and “No Appointment” sales are left out), by active FieldRoutes users of every type: sales reps, technicians and office staff.</dd></div>
          <div className="gl-row"><dt>Excluded services</dt><dd>{(data?.excluded || []).join(', ') || 'None'}.</dd></div>
          <div className="gl-row"><dt>Offices</dt><dd>Each sale counts for the salesperson’s FieldRoutes office, like the FieldRoutes leaderboard. (The Operations Suite counts by the customer’s office instead.)</dd></div>
          <div className="gl-row"><dt>Auto-pay</dt><dd>The customer’s auto-pay setting. Bad payment methods = customers on auto-pay whose card or bank on file isn’t valid.</dd></div>
          <div className="gl-row"><dt>Selling days</dt><dd>Days the person sold or knocked doors. FieldRoutes counts these differently, so this and the daily average can differ from FieldRoutes.</dd></div>
          <div className="gl-row"><dt>Knocks</dt><dd>Doors knocked in the period, from all of a person’s FieldRoutes logins.</dd></div>
          <div className="gl-row"><dt>Not here yet</dt><dd>Switch overs, multi-years and paid in fulls (not in the app’s copy of FieldRoutes yet).</dd></div>
        </dl>
      </details>
    </>
  );
}
