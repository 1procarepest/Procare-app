'use client';

import Link from 'next/link';
import { useState } from 'react';
import Bug from '../Bug';
import { VIEWS, shiftPeriod } from '@/lib/repcards';
import { LINES, OPS_OFFICES, SELLERS, change, int, money0, moneyK, pct1, reservice } from '@/lib/ops';

const href = (view, date) => `/ops?view=${view}&date=${date}`;
const PERIOD_WORD = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };

/** ▲ 12.3% / ▼ 4.0%. goodWhenDown flips the color (cancels, reservices). pts = percentage-point change. */
function Delta({ cur, prior, goodWhenDown, pts, pill }) {
  let d, text;
  if (pts) {
    if (cur === null || prior === null || cur === undefined || prior === undefined) return null;
    d = (cur - prior) * 100;
    text = `${Math.abs(d).toFixed(1)} pts`;
  } else {
    const c = change(cur, prior);
    if (c === null) return pill ? <span className="ops-pill">No comparison yet</span> : null;
    d = c;
    text = `${Math.abs(c * 100).toFixed(1)}%`;
  }
  if (Math.abs(d) < 0.0005) return <span className={`ops-delta flat${pill ? ' ops-pill' : ''}`}>▲ 0.0{pts ? ' pts' : '%'}</span>;
  const good = goodWhenDown ? d < 0 : d > 0;
  return <span className={`ops-delta ${good ? 'good' : 'bad'}${pill ? ' ops-pill' : ''}`}>{d > 0 ? '▲' : '▼'} {text}</span>;
}

function Box({ value, label, tone }) {
  return <div className={`ops-box${tone ? ` ops-box-${tone}` : ''}`}><span className="ops-box-val">{value}</span><span className="ops-box-label">{label}</span></div>;
}

/** Horizontal bars, top 5 with "Show all". */
function Bars({ items, color, empty = 'None in this time frame.' }) {
  const [all, setAll] = useState(false);
  const list = Object.entries(items).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!list.length) return <p className="ops-none">{empty}</p>;
  const max = list[0][1] || 1;
  const shown = all ? list : list.slice(0, 5);
  return (
    <>
      <ul className="ops-bars">
        {shown.map(([k, v]) => (
          <li key={k}>
            <span className="ops-bar-name" title={k}>{k}</span>
            <span className="ops-bar-track"><span style={{ width: `${(v / max) * 100}%`, background: color }} /></span>
            <span className="ops-bar-n">{v}</span>
          </li>
        ))}
      </ul>
      {list.length > 5 && (
        <button type="button" className="ops-more" onClick={() => setAll((a) => !a)}>{all ? '▾ Show top 5' : `▸ Show all ${list.length}`}</button>
      )}
    </>
  );
}

function Section({ bug, title, right, children }) {
  return (
    <section className="ops-sec">
      <div className="ops-sec-head"><Bug kind={bug} size={24} color="var(--forest)" /><h3>{title}</h3><span className="ops-sec-right">{right}</span></div>
      {children}
    </section>
  );
}

function OfficeCard({ name, s, p, view, total }) {
  const rs = reservice(s);
  return (
    <article className={`ops-card${total ? ' ops-card-total' : ''}`}>
      <header className="ops-card-head"><h2>{name}</h2><span>{PERIOD_WORD[view]}</span></header>

      <Section bug="spider" title="Sales" right={<Delta cur={s.far} prior={p.far} />}>
        <div className="ops-boxes ops-3">
          <Box value={int(s.new_customers)} label="New customers" />
          <Box value={int(s.services)} label="New services" />
          <Box value={moneyK(s.far)} label="Future revenue" />
        </div>
        <p className="ops-kicker">By sales source · services</p>
        <Bars items={s.sources} color="var(--green)" />
        <p className="ops-kicker">By who sold it</p>
        <table className="ops-table">
          <thead><tr><th>Seller</th><th>Services</th><th>Future rev.</th><th>Auto-pay</th></tr></thead>
          <tbody>
            {[...SELLERS, ...Object.keys(s.sellers).filter((k) => !SELLERS.includes(k))].map((k) => {
              const v = s.sellers[k] || { n: 0, far: 0, ap: 0 };
              return <tr key={k}><th scope="row">{k}</th><td>{v.n}</td><td>{moneyK(v.far)}</td><td className="ops-good">{v.n ? pct1(v.ap / v.n) : '—'}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="ops-note">Other services (not in totals): {int(s.other_n)} · {moneyK(s.other_far)}</p>
      </Section>

      <Section bug="roach" title="Cancellations" right={<Delta cur={s.cxl} prior={p.cxl} goodWhenDown />}>
        <div className="ops-boxes ops-2">
          <Box value={int(s.cxl)} label="Cancelled services" />
          <Box value={moneyK(s.lost)} label="Future revenue lost" tone="bad" />
        </div>
        <p className="ops-kicker">By reason</p>
        <Bars items={s.reasons} color="var(--ink)" />
      </Section>

      <Section bug="cricket" title="Appointments" right={<Delta cur={s.completed} prior={p.completed} />}>
        <div className="ops-boxes ops-2">
          <Box value={int(s.completed)} label="Completed" />
          <Box value={int(s.remaining)} label="Remaining today" tone="sage" />
        </div>
      </Section>

      <Section bug="tick" title="Reservice rate" right={<strong className="ops-big-rate">{pct1(rs.all)}</strong>}>
        <div className="ops-boxes ops-3">
          <Box value={pct1(rs.callback)} label="Reservice (Callback)" tone="ink" />
          <Box value={pct1(rs.partial)} label="Partial (Weather)" />
          <Box value={pct1(rs.incomplete)} label="Incomplete (Missing Materials)" />
        </div>
        <table className="ops-table">
          <thead><tr><th>Service line</th><th>Callback</th><th>Weather</th><th>Missing</th></tr></thead>
          <tbody>
            {LINES.map((l) => {
              const v = rs.byLine[l.key];
              return <tr key={l.key}><th scope="row">{l.label}</th><td><strong>{pct1(v.callback)}</strong></td><td>{pct1(v.partial)}</td><td>{pct1(v.incomplete)}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="ops-note">{int(rs.base)} regular services completed in these lines.</p>
      </Section>
    </article>
  );
}

function PoolCard({ name, pool, months, total }) {
  const rows = [
    ['Core services', 'left_core'],
    ['Other services', 'left_other'],
  ];
  const all = (b) => pool[b].left_core + pool[b].left_other;
  const buckets = [['past', 'Past due'], ['this', months[0]], ['next', months[1]]];
  return (
    <article className={`ops-mini${total ? ' ops-mini-total' : ''}`}>
      <div className="ops-mini-head"><Bug kind="termite" size={24} /><h3>{name}</h3></div>
      <p className="ops-kicker">Left in job pool · not on the schedule</p>
      <table className="ops-table ops-pool">
        <thead><tr><th>Services due</th>{buckets.map(([b, l]) => <th key={b}>{l}</th>)}</tr></thead>
        <tbody>
          {rows.map(([label, k]) => (
            <tr key={k}><th scope="row">{label}</th>{buckets.map(([b]) => <td key={b} className={b === 'past' ? 'ops-bad' : ''}>{int(pool[b][k])}</td>)}</tr>
          ))}
          <tr className="ops-row-total"><th scope="row">All services</th>{buckets.map(([b]) => <td key={b} className={b === 'past' ? 'ops-bad' : ''}>{int(all(b))}</td>)}</tr>
        </tbody>
      </table>
      <p className="ops-kicker">Scheduled vs left · all services</p>
      {buckets.map(([b, l]) => {
        const sch = pool[b].scheduled, left = all(b), tot = sch + left;
        return (
          <div key={b} className="ops-split">
            <div className="ops-split-label"><strong>{l}</strong><span>{int(sch)} scheduled · <strong>{int(left)} left</strong></span></div>
            <div className="ops-split-bar"><span style={{ width: tot ? `${(sch / tot) * 100}%` : 0 }} /></div>
          </div>
        );
      })}
      <ul className="ops-legend"><li><span className="ops-key ops-key-on" />On the schedule</li><li><span className="ops-key ops-key-left" />Left in job pool</li></ul>
      <p className="ops-note">Core = General Pest, Termite Baiting, Mosquito, Mosquito Green.</p>
    </article>
  );
}

function ArCard({ name, a, total }) {
  const past = a.d30 + a.d60 + a.d90;
  const seg = [['cur', 'Current', 'var(--green)'], ['d30', '30 days', 'var(--lime)'], ['d60', '60 days', '#D0913A'], ['d90', '90+ days', '#A3322A']];
  return (
    <article className={`ops-mini${total ? ' ops-mini-total' : ''}`}>
      <div className="ops-mini-head"><Bug kind="mosquito" size={24} /><h3>{name}</h3></div>
      <div className="ops-ar-top">
        <div><span className="ops-box-label">Accounts receivable</span><span className="ops-ar-val">{money0(a.ar)}</span></div>
        <div><span className="ops-box-label">Past due (30+)</span><span className="ops-ar-val">{money0(past)}</span></div>
      </div>
      <div className="ops-aging">{seg.map(([k, , c]) => (a[k] > 0 ? <span key={k} style={{ width: `${(a[k] / (a.ar || 1)) * 100}%`, background: c }} /> : null))}</div>
      <ul className="ops-aging-key">
        {seg.map(([k, l, c]) => <li key={k}><span className="ops-key" style={{ background: c }} />{l}<strong>{moneyK(a[k])}</strong></li>)}
      </ul>
      <div className="ops-ap">
        <div>
          <span className="ops-ap-val">{pct1(a.accounts ? a.ap_valid / a.accounts : null)}</span>
          <span className="ops-box-label">Accounts on auto-pay</span>
          <span className="ops-ap-sub">{int(a.ap_valid)} valid of {int(a.accounts)} recurring customers</span>
          {a.ap_invalid > 0 && <span className="ops-ap-bad">{int(a.ap_invalid)} with invalid payment methods</span>}
        </div>
        <div>
          <span className="ops-ap-val">{pct1(a.subs ? a.ap_subs / a.subs : null)}</span>
          <span className="ops-box-label">Subscriptions on auto-pay</span>
          <span className="ops-ap-sub">{int(a.ap_subs)} valid of {int(a.subs)} recurring subscriptions</span>
        </div>
      </div>
    </article>
  );
}

function Tiles({ s, p }) {
  const rs = reservice(s), rp = reservice(p);
  const tiles = [
    ['New customers', int(s.new_customers), <Delta key="d" cur={s.new_customers} prior={p.new_customers} pill />, 'ant', 'ink'],
    ['New services', int(s.services), <Delta key="d" cur={s.services} prior={p.services} pill />, 'spider', 'forest'],
    ['Future revenue', moneyK(s.far), <Delta key="d" cur={s.far} prior={p.far} pill />, 'ant', 'lime'],
    ['Cancellations', int(s.cxl), <Delta key="d" cur={s.cxl} prior={p.cxl} goodWhenDown pill />, 'roach', 'sage'],
    ['Future revenue lost', moneyK(s.lost), <Delta key="d" cur={s.lost} prior={p.lost} goodWhenDown pill />, 'stinging', 'ink'],
    ['Completed appts', int(s.completed), <Delta key="d" cur={s.completed} prior={p.completed} pill />, 'cricket', 'forest'],
    ['Reservice (callback)', pct1(rs.callback), <Delta key="d" cur={rs.callback} prior={rp.callback} goodWhenDown pts pill />, 'tick', 'lime'],
  ];
  return (
    <div className="ops-tiles">
      {tiles.map(([label, value, delta, bug, tone]) => (
        <div key={label} className={`ops-tile ops-tile-${tone}`}>
          <Bug kind={bug} size={84} className="ops-tile-bug" />
          <span className="ops-tile-label">{label}</span>
          <span className="ops-tile-val">{value}</span>
          {delta}
        </div>
      ))}
    </div>
  );
}

const PICKS = [{ key: 'all', name: 'All' }, ...OPS_OFFICES, { key: 'total', name: 'Total' }];

export default function OpsView({ view, range, today, stats, snap, syncedAt }) {
  const [office, setOffice] = useState('all');
  const offices = office === 'all' ? OPS_OFFICES : OPS_OFFICES.filter((o) => o.key === office);
  const showTotal = office === 'all' || office === 'total';
  const time = (t) => (t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const asOf = snap.asOf ? new Date(snap.asOf).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : '';
  const next = shiftPeriod(view, range.anchor, 1);
  const months = [snap.thisMonth, snap.nextMonth];
  const scope = office === 'all' ? 'All offices' : office === 'total' ? 'Total · all offices' : PICKS.find((o) => o.key === office).name;

  return (
    <>
      <div className="rc-top bug-band">
        <div>
          <p className="rc-kicker">Operations</p>
          <h1 className="rc-title">Operation <em>Suite</em></h1>
        </div>
        {syncedAt && <p className="rc-updated">Updated {time(syncedAt)} ET · refreshes from FieldRoutes about every 15 minutes</p>}
      </div>

      <div className="rc-controls">
        <nav className="rc-seg" aria-label="Time frame">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href(v.key, range.anchor)} className={v.key === view ? 'on' : ''} aria-current={v.key === view ? 'page' : undefined} scroll={false}>{v.label}</Link>
          ))}
        </nav>
        <div className="rc-step">
          <Link className="rc-arrow" href={href(view, shiftPeriod(view, range.anchor, -1))} aria-label="Earlier" scroll={false}>‹</Link>
          <input className="ops-date" type="date" value={range.anchor} max={today} aria-label="Date"
            onChange={(e) => { if (e.target.value) window.location.href = href(view, e.target.value); }} />
          {range.to >= today
            ? <span className="rc-arrow off" aria-hidden="true">›</span>
            : <Link className="rc-arrow" href={href(view, next > today ? today : next)} aria-label="Later" scroll={false}>›</Link>}
          {range.anchor !== today && <Link className="ops-today" href={href(view, today)} scroll={false}>Today</Link>}
        </div>
        <div className="ops-picks" role="group" aria-label="Office">
          {PICKS.map((o) => (
            <button key={o.key} type="button" className={`ops-pick${office === o.key ? ' on' : ''}`} onClick={() => setOffice(o.key)} aria-pressed={office === o.key}>{o.name}</button>
          ))}
        </div>
      </div>

      <div className="ops-heading">
        <h2>{range.title}</h2>
        <p>{scope} · {range.vs}</p>
      </div>

      <p className="ops-kicker ops-group">{office === 'total' ? 'Company total' : 'By office'}</p>
      <div className="ops-cards">
        {office !== 'total' && offices.map((o) => <OfficeCard key={o.key} name={o.name} s={stats[o.key].cur} p={stats[o.key].prior} view={view} />)}
        {showTotal && <OfficeCard name="Total · all offices" s={stats.total.cur} p={stats.total.prior} view={view} total />}
      </div>

      <p className="ops-kicker ops-group">Job pool · as of {asOf}</p>
      <p className="ops-note">Services due (next service date on active, recurring subscriptions; one-time, as-needed, on-hold and out-of-season seasonal plans are left out) that aren’t on the schedule yet. Doesn’t change with the time frame.</p>
      <div className="ops-minis">
        {office !== 'total' && offices.map((o) => <PoolCard key={o.key} name={o.name} pool={snap[o.key].pool} months={months} />)}
        {showTotal && <PoolCard name="Total · all offices" pool={snap.total.pool} months={months} total />}
      </div>

      <p className="ops-kicker ops-group">AR &amp; auto-pay · as of {asOf} <span className="ops-note-inline">Balances right now. These don’t change with the time frame.</span></p>
      <div className="ops-minis">
        {office !== 'total' && offices.map((o) => <ArCard key={o.key} name={o.name} a={snap[o.key]} />)}
        {showTotal && <ArCard name="Total · all offices" a={snap.total} total />}
      </div>

      <p className="ops-kicker ops-group">Company total · all offices</p>
      <Tiles s={stats.total.cur} p={stats.total.prior} />

      <p className="ops-note ops-foot">
        Totals count the 4 core services only: General Pest, Mosquito, Mosquito Green and Termite Baiting. Future revenue = price per service ×
        billing multiplier, initial fees excluded. Reservice rates are out of regular services completed in those lines: Partial = weather,
        Incomplete = missing materials. AR aging uses each customer’s oldest unpaid balance. A cancel only counts once the customer had a service.
      </p>
    </>
  );
}
