'use client';

import { useEffect, useMemo, useState } from 'react';
import Toggle from '../Toggle';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { calcPay, incentiveOn, money, money0, num, pct } from '@/lib/scorecard';
import { photoSrc } from '@/lib/photo';

// Leaderboard columns people can switch on and off (saved on this device). Reservice and cancels start off.
const COLUMNS = [
  { key: 'incentive', label: 'Incentive', on: true, bonus: true },
  { key: 'sold', label: 'Sold', on: true },
  { key: 'sales', label: 'Serviced', on: true },
  { key: 'autopay', label: 'Auto-pay', on: true },
  { key: 'serv', label: 'Completed', on: true },
  { key: 'comp', label: 'Completion', on: true },
  { key: 'resv', label: 'Reservice', on: false },
  { key: 'cxTech', label: 'Cancels tech', on: false },
  { key: 'cxBilling', label: 'Cancels billing', on: false },
  { key: 'stars', label: 'Reviews', on: true },
  { key: 'safety', label: 'Safety', on: true },
];
const COLS_KEY = 'scorecard-columns-v1';
const defaultCols = () => COLUMNS.filter((c) => c.on).map((c) => c.key);

const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`);
const initials = (name) => name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Everything one row needs, for the current and the earlier stretch. */
function measure(m, R, scale) {
  if (!m) return null;
  const pay = calcPay(m, R, scale);
  return {
    pay,
    serv: num(m.serv),
    sched: num(m.sched),
    comp: num(m.routed) ? pct(m.route_done, m.routed) : null,
    routed: num(m.routed),
    routeDone: num(m.route_done),
    resvN: num(m.reservices) + num(m.incompletes),
    resv: num(m.serv) ? pct(num(m.reservices) + num(m.incompletes), m.serv) : null,
    partials: num(m.partials),
    salesDone: num(m.sales_done),
    autopay: num(m.autopay_added),
    sold: num(m.sold),
    soldValue: num(m.sold_value),
    salesDoneValue: num(m.sales_done_value),
    cxTech: num(m.cx_tech),
    cxBilling: num(m.cx_billing),
    stars: num(m.stars),
    reviews: num(m.reviews),
    rating: m.rating === null || m.rating === undefined ? null : num(m.rating),
    safety: m.drive_score === null || m.drive_score === undefined || !num(m.drive_miles) ? null : num(m.drive_score),
    miles: num(m.drive_miles),
    distracted: num(m.distracted),
    driveSource: m.drive_source,
    hours: num(m.drive_hours),
    harshBrake: num(m.harsh_brake),
    harshAccel: num(m.harsh_accel),
    harshTurn: num(m.harsh_turn),
    speedPct: m.speed_pct === null || m.speed_pct === undefined ? null : num(m.speed_pct),
    following: num(m.following),
    rolling: num(m.rolling_stops),
    seatbelt: num(m.seatbelt),
    crash: num(m.crash),
  };
}

function Arrow({ cur, prior, lowerIsBetter }) {
  if (cur === null || cur === undefined || prior === null || prior === undefined) return null;
  const diff = cur - prior;
  if (Math.abs(diff) < 0.05) return null;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return <span className={`arrow ${good ? 'good' : 'bad'}`} aria-label={diff > 0 ? 'up' : 'down'}>{diff > 0 ? '▲' : '▼'}</span>;
}

function Avatar({ t, size = 40 }) {
  const src = photoSrc(t.photo);
  return src
    ? <img className="face" src={src} alt="" width={size} height={size} loading="lazy" />
    : <span className="face face-initials" style={{ width: size, height: size }} aria-hidden="true">{initials(t.name)}</span>;
}

export default function ScorecardView({ techs, R, per, period, meId }) {
  const scale = num(per.scale);
  const bonusesOn = !!R.bonuses_on;
  const [tab, setTab] = useState('techs');
  const [office, setOffice] = useState('all');
  const [sort, setSort] = useState({ key: bonusesOn ? 'incentive' : 'rank', dir: -1 });
  const [picked, setPicked] = useState(meId);
  const [cols, setCols] = useState(defaultCols);
  const [colsOpen, setColsOpen] = useState(false);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(COLS_KEY) || 'null'); if (Array.isArray(saved)) setCols(saved); } catch { /* keep defaults */ }
  }, []);
  const setCol = (key, on) => setCols((cur) => {
    const next = on ? [...new Set([...cur, key])] : cur.filter((k) => k !== key);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch { /* not saved on this device */ }
    return next;
  });
  const show = (key) => cols.includes(key);

  const rows = useMemo(() => {
    const list = techs.map((t) => ({ ...t, c: measure(t.cur, R, scale), p: measure(t.prior, R, scale) }))
      .filter((t) => t.c && (t.c.sched > 0 || t.c.routed > 0 || t.c.safety !== null || t.id === meId));
    // Rank: qualified techs by incentive when bonuses are on, otherwise by completed jobs.
    const value = (t) => (bonusesOn ? t.c.pay.total : t.c.serv);
    list.filter((t) => t.c.pay.qualified).sort((a, b) => value(b) - value(a) || b.c.serv - a.c.serv).forEach((t, i) => { t.rank = i + 1; });
    return list;
  }, [techs, R, scale, bonusesOn, meId]);

  const shown = rows.filter((t) => office === 'all' || t.office === office);
  const sortVal = {
    rank: (t) => (t.rank ? -t.rank : -9999),
    name: (t) => t.name,
    incentive: (t) => t.c.pay.total,
    sold: (t) => t.c.sold,
    sales: (t) => t.c.salesDone,
    autopay: (t) => t.c.autopay,
    serv: (t) => t.c.serv,
    comp: (t) => t.c.comp ?? -1,
    resv: (t) => t.c.resv ?? -1,
    cxTech: (t) => t.c.cxTech,
    cxBilling: (t) => t.c.cxBilling,
    stars: (t) => t.c.stars,
    safety: (t) => t.c.safety ?? -1,
  };
  const sorted = [...shown].sort((a, b) => {
    const x = sortVal[sort.key](a), y = sortVal[sort.key](b);
    const d = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return d * sort.dir || a.name.localeCompare(b.name);
  });
  const sel = rows.find((t) => t.id === picked) || null;

  const Th = ({ k, children, num: isNum = true }) => (
    <th className={isNum ? 'num' : ''} aria-sort={sort.key === k ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : (k === 'name' ? 1 : -1) }))}>
        {children}{sort.key === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <>
      <nav className="tabs tabs-inline" aria-label="View">
        <button type="button" className={`tab${tab === 'techs' ? ' active' : ''}`} onClick={() => setTab('techs')}>Technicians</button>
        <button type="button" className={`tab${tab === 'offices' ? ' active' : ''}`} onClick={() => setTab('offices')}>Offices</button>
      </nav>

      {tab === 'techs' ? (
        <div className="sc-layout">
          <section className="sc-board" aria-labelledby="board-heading">
            <div className="sc-board-head">
              <h2 id="board-heading">Leaderboard</h2>
              <div className="chips" role="group" aria-label="Office">
                {[{ key: 'all', name: 'All offices' }, ...OFFICES].map((o) => (
                  <button key={o.key} type="button" className={`chip${office === o.key ? ' on' : ''}`} onClick={() => setOffice(o.key)}>{o.name}</button>
                ))}
              </div>
            </div>
            <div className="sc-cols-row">
              <p className="note">Click a column to sort and a technician to see their breakdown. Safety arrows compare with {period.prior}.</p>
              <button type="button" className="chip" aria-expanded={colsOpen} onClick={() => setColsOpen((o) => !o)}>Columns ({COLUMNS.filter((c) => (bonusesOn || !c.bonus) && show(c.key)).length}) {colsOpen ? '▴' : '▾'}</button>
            </div>
            {colsOpen && (
              <div className="sc-cols">
                {COLUMNS.filter((c) => bonusesOn || !c.bonus).map((c) => (
                  <Toggle key={c.key} checked={show(c.key)} onChange={(on) => setCol(c.key, on)}>{c.label}</Toggle>
                ))}
                <button type="button" className="link" onClick={() => { setCols(defaultCols()); try { localStorage.removeItem(COLS_KEY); } catch { /* ignore */ } }}>Reset</button>
              </div>
            )}
            <div className="board-wrap">
              <table className="board freeze-first">
                <thead>
                  <tr>
                    <Th k="name" num={false}>Technician</Th>
                    {bonusesOn && show('incentive') && <Th k="incentive">Incentive</Th>}
                    {show('sold') && <Th k="sold">Sold</Th>}
                    {show('sales') && <Th k="sales">Serviced</Th>}
                    {show('autopay') && <Th k="autopay">Auto-pay</Th>}
                    {show('serv') && <Th k="serv">Completed</Th>}
                    {show('comp') && <Th k="comp">Completion</Th>}
                    {show('resv') && <Th k="resv">Reservice</Th>}
                    {show('cxTech') && <Th k="cxTech">Cancels tech</Th>}
                    {show('cxBilling') && <Th k="cxBilling">Cancels billing</Th>}
                    {show('stars') && <Th k="stars">Reviews</Th>}
                    {show('safety') && <Th k="safety">Safety</Th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t) => (
                    <tr key={t.id} className={`${t.id === picked ? 'current' : ''}${t.c.pay.qualified ? '' : ' unqualified'}`} onClick={() => setPicked(t.id)}>
                      <td>
                        <button type="button" className="who" onClick={() => setPicked(t.id)}>
                          <Avatar t={t} />
                          <span>
                            <span className="who-name">{t.name}</span>
                            <span className="who-sub">
                              {t.rank ? `#${t.rank} · ` : ''}{OFFICE_NAME[t.office] || 'No office'}
                              {!bonusesOn && !t.c.pay.qualified && <span className="pill"> Under {t.c.pay.minServed}</span>}
                            </span>
                          </span>
                        </button>
                      </td>
                      {bonusesOn && show('incentive') && (
                        <td className="num">
                          {t.c.pay.total > 0 && <span className="money-good">{money0(t.c.pay.total)}</span>}
                          {t.c.pay.gated ? <span className="pill pill-bad">{t.c.pay.keepsSales ? 'Sales only' : 'On hold'}</span>
                            : !t.c.pay.qualified ? <span className="pill">Under {t.c.pay.minServed}</span>
                            : t.c.pay.total > 0 ? null : <span className="money-good">{money0(0)}</span>}
                        </td>
                      )}
                      {show('sold') && (<td className="num">{t.c.sold}{t.c.soldValue > 0 && <span className="cell-sub">{money0(t.c.soldValue)}</span>}</td>)}
                      {show('sales') && (<td className="num"><strong>{t.c.salesDone}</strong>{t.c.salesDoneValue > 0 && <span className="cell-sub">{money0(t.c.salesDoneValue)}</span>}</td>)}
                      {show('autopay') && (<td className="num">{t.c.autopay}</td>)}
                      {show('serv') && (<td className="num">{t.c.serv}</td>)}
                      {show('comp') && (<td className="num">{fmtPct(t.c.comp)}</td>)}
                      {show('resv') && (<td className="num">{fmtPct(t.c.resv)}</td>)}
                      {show('cxTech') && (<td className="num">{t.c.cxTech ? <span className="ring">{t.c.cxTech}</span> : 0}</td>)}
                      {show('cxBilling') && (<td className="num">{t.c.cxBilling}</td>)}
                      {show('stars') && (<td className="num">{t.c.stars}{t.c.rating !== null && <span className="cell-sub">{t.c.rating}★ avg</span>}</td>)}
                      {show('safety') && (<td className="num">{t.c.safety ?? '—'} <Arrow cur={t.c.safety} prior={t.p?.safety} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!sorted.length && <p className="note">No technician work in this period yet.</p>}
          </section>

          <aside className="sc-panel" aria-label="Breakdown">
            {sel ? <Breakdown t={sel} R={R} period={period} per={per} bonusesOn={bonusesOn} /> : <p className="note">Pick a technician to see their breakdown.</p>}
          </aside>
        </div>
      ) : (
        <Offices rows={rows} R={R} bonusesOn={bonusesOn} onPick={(k) => { setOffice(k); setTab('techs'); }} />
      )}

      <Glossary R={R} bonusesOn={bonusesOn} />
    </>
  );
}

function Line({ label, value, children }) {
  return <div className="bd-line"><span>{label}</span><span className="num">{value}{children}</span></div>;
}

function Breakdown({ t, R, period, per, bonusesOn }) {
  const c = t.c, p = t.p || {};
  const pay = c.pay;
  return (
    <div className="bd">
      <p className="bd-eyebrow">Breakdown · {period.label}</p>
      <div className="bd-who">
        <Avatar t={t} size={72} />
        <h2>{t.name}</h2>
      </div>
      <div className="bd-pills">
        <span className={`pill ${pay.qualified ? 'pill-good' : ''}`}>{pay.qualified ? 'Qualified' : `Under ${pay.minServed} completed`}</span>
        <span className="pill">{OFFICE_NAME[t.office] || 'No office'}</span>
        {t.rank && <span className="pill">Rank #{t.rank}</span>}
        {bonusesOn && pay.gated && <span className="pill pill-bad">{pay.keepsSales ? `Sales bonuses only: driving under ${R.drive_gate}` : `On hold: driving under ${R.drive_gate}`}</span>}
      </div>

      <div className="bd-lines">
        <Line label="Completed jobs" value={c.serv}><Arrow cur={c.serv} prior={p.serv} /></Line>
        <Line label="Completion" value={c.routed ? `${fmtPct(c.comp)} (${c.routeDone} of ${c.routed})` : 'No routes saved yet'}><Arrow cur={c.comp} prior={p.comp} /></Line>
        <Line label="Sales sold" value={`${c.sold} (${money0(c.soldValue)})`}><Arrow cur={c.sold} prior={p.sold} /></Line>
        <Line label="Sales serviced (paid)" value={`${c.salesDone} (${money0(c.salesDoneValue)})`}><Arrow cur={c.salesDone} prior={p.salesDone} /></Line>
        <Line label="Auto-pay added" value={c.autopay}><Arrow cur={c.autopay} prior={p.autopay} /></Line>
        <Line label="Reservices" value={`${c.resvN} (${fmtPct(c.resv)})`}><Arrow cur={c.resv} prior={p.resv} lowerIsBetter /></Line>
        {c.partials > 0 && <Line label="Weather partials (not counted)" value={c.partials} />}
        <Line label="Cancels: tech / billing" value={`${c.cxTech} / ${c.cxBilling}`} />
        <Line label="Reviews" value={`${c.stars} top of ${c.reviews}${c.rating !== null ? `, ${c.rating}★` : ''}`} />
        <Line label="Safety" value={c.safety === null ? 'No driving' : `${c.safety} · ${c.miles.toLocaleString()} mi`}><Arrow cur={c.safety} prior={p.safety} /></Line>
      </div>

      {bonusesOn ? (
        <div className="bd-lines bd-pay">
          {incentiveOn(R, 'sales') && <Line label={`Sales serviced ${c.salesDone} × ${money0(R.sale_amt)}`} value={money(pay.sales)} />}
          {incentiveOn(R, 'autopay') && <Line label={`Auto-pay added ${c.autopay} × ${money0(R.autopay_amt)}`} value={money(pay.autopay)} />}
          {incentiveOn(R, 'completed') && <Line label={`Completed jobs ${c.serv}`} value={money(pay.completed)} />}
          {incentiveOn(R, 'completion') && <Line label={`Completion ${fmtPct(c.comp)}`} value={money(pay.completion)} />}
          {incentiveOn(R, 'reservice') && <Line label={`Reservice rate ${fmtPct(c.resv)} (at or under ${num(R.resv_max)}%)`} value={money(pay.reservice)} />}
          {incentiveOn(R, 'reviews') && <Line label={`${c.stars} top reviews × ${money0(R.star_amt)}`} value={money(pay.stars)} />}
          {incentiveOn(R, 'safety') && (
            <Line label={`Safe driving${pay.distractedCap ? ` (over ${pay.distractedMax} distracted)` : c.safety !== null ? ` (score ${c.safety})` : ''}`} value={money(pay.driving)} />
          )}
          {pay.cancelPenalty > 0 && <Line label={`${c.cxTech} tech-caused cancels`} value={`−${money(pay.cancelPenalty)}`} />}
          {pay.gated && <Line label={pay.keepsSales ? 'Held: driving score (sales still paid)' : 'On hold (driving score)'} value={`−${money(pay.held)}`} />}
          <div className="bd-total"><span>Incentive{per.in_progress ? ' so far' : ''}</span><span className="num">{money(pay.total)}</span></div>
        </div>
      ) : (
        <p className="note bd-pay">Bonus amounts haven’t been set yet. These numbers still count, and the incentive will show here once they are.</p>
      )}

      <Driving c={c} p={t.p} />
    </div>
  );
}

/** Per 1,000 miles, so short and long stretches compare fairly. */
const per1k = (n, miles) => (miles ? (n / miles) * 1000 : null);
const fmt1 = (v) => (v === null ? '—' : v.toFixed(1));

function Tile({ label, value, sub, cur, prior, lowerIsBetter, fmt = (v) => v }) {
  const has = cur !== null && cur !== undefined && prior !== null && prior !== undefined;
  const diff = has ? cur - prior : 0;
  const same = has && Math.abs(diff) < 0.05;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      <span className="tile-sub">
        {sub}
        {has && (same
          ? <span className="trend-same"> ● same</span>
          : <span className={`arrow ${good ? 'good' : 'bad'}`}> {diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))}</span>)}
      </span>
    </div>
  );
}

function Driving({ c, p }) {
  const q = p || {};
  if (c.safety === null) {
    return (
      <details className="drive" open>
        <summary>Driving</summary>
        <p className="note">No driving in Samsara for this period.</p>
      </details>
    );
  }
  const pm = q.safety === null || q.safety === undefined ? null : q.miles;
  const rate = (k) => [per1k(c[k], c.miles), pm ? per1k(q[k], pm) : null];
  const [hb, hbp] = rate('harshBrake'), [ha, hap] = rate('harshAccel'), [ht, htp] = rate('harshTurn');
  return (
    <details className="drive" open>
      <summary>Driving · safety score {c.safety}</summary>
      <div className="tiles">
        <Tile label="Safety score" value={c.safety} sub="0–100" cur={c.safety} prior={q.safety ?? null} />
        <Tile label="Miles" value={c.miles.toLocaleString()} sub={`${c.hours} hrs driving`} cur={c.miles} prior={pm} fmt={(v) => Math.round(v).toLocaleString()} />
        <Tile label="Distracted" value={c.distracted} sub="phone use" cur={c.distracted} prior={pm === null ? null : q.distracted} lowerIsBetter />
        <Tile label="Harsh braking" value={c.harshBrake} sub={`${fmt1(hb)} / 1k mi`} cur={hb} prior={hbp} lowerIsBetter fmt={fmt1} />
        <Tile label="Harsh accel" value={c.harshAccel} sub={`${fmt1(ha)} / 1k mi`} cur={ha} prior={hap} lowerIsBetter fmt={fmt1} />
        <Tile label="Harsh turns" value={c.harshTurn} sub={`${fmt1(ht)} / 1k mi`} cur={ht} prior={htp} lowerIsBetter fmt={fmt1} />
        <Tile label="Speeding" value={c.speedPct === null ? '—' : `${c.speedPct}%`} sub="of drive time" cur={c.speedPct} prior={pm === null ? null : q.speedPct} lowerIsBetter fmt={(v) => `${v.toFixed(1)} pts`} />
        <Tile label="Following dist." value={c.following} sub="too close" cur={c.following} prior={pm === null ? null : q.following} lowerIsBetter />
        <Tile label="Rolling stops" value={c.rolling} sub="stop signs" cur={c.rolling} prior={pm === null ? null : q.rolling} lowerIsBetter />
        <Tile label="Seat belt" value={c.seatbelt} sub="unbuckled" cur={c.seatbelt} prior={pm === null ? null : q.seatbelt} lowerIsBetter />
        <Tile label="Crashes" value={c.crash} sub="detected" cur={c.crash} prior={pm === null ? null : q.crash} lowerIsBetter />
      </div>
      <p className="note">From {c.driveSource === 'driver' ? 'their Samsara driver profile' : 'their truck (not set up as a Samsara driver yet)'}. Arrows compare with the earlier stretch.</p>
    </details>
  );
}

function sumBy(list, f) { return list.reduce((a, t) => a + f(t), 0); }

function officeTotals(list, side) {
  const m = list.map((t) => t[side]).filter(Boolean);
  const miles = sumBy(m, (x) => (x.safety === null ? 0 : x.miles));
  return {
    incentive: sumBy(m, (x) => x.pay.total),
    qualified: m.filter((x) => x.pay.qualified).length,
    total: m.length,
    held: m.filter((x) => x.pay.gated).length,
    salesDone: sumBy(m, (x) => x.salesDone),
    autopay: sumBy(m, (x) => x.autopay),
    sold: sumBy(m, (x) => x.sold),
    serv: sumBy(m, (x) => x.serv),
    comp: sumBy(m, (x) => x.routed) ? (sumBy(m, (x) => x.routeDone) / sumBy(m, (x) => x.routed)) * 100 : null,
    resv: sumBy(m, (x) => x.serv) ? (sumBy(m, (x) => x.resvN) / sumBy(m, (x) => x.serv)) * 100 : null,
    cxTech: sumBy(m, (x) => x.cxTech),
    cxBilling: sumBy(m, (x) => x.cxBilling),
    stars: sumBy(m, (x) => x.stars),
    safety: miles ? Math.round(sumBy(m, (x) => (x.safety === null ? 0 : x.safety * x.miles)) / miles) : null,
  };
}

function Offices({ rows, R, bonusesOn, onPick }) {
  const groups = [...OFFICES.map((o) => ({ key: o.key, name: o.name, list: rows.filter((t) => t.office === o.key) })),
    { key: 'all', name: 'All offices', list: rows, all: true }];
  return (
    <section className="sc-board" aria-labelledby="offices-heading">
      <h2 id="offices-heading">Office comparison</h2>
      <p className="note">Totals for the technicians in each office. Safety is a mileage-weighted average. Click an office to see its technicians.</p>
      <div className="board-wrap">
        <table className="board freeze-first">
          <thead>
            <tr>
              <th>Office</th>
              {bonusesOn && <th className="num">Incentives</th>}
              <th className="num">Qualified techs</th><th className="num">Sold</th><th className="num">Serviced</th><th className="num">Auto-pay</th><th className="num">Completed</th>
              <th className="num">Completion</th><th className="num">Reservice</th><th className="num">Cancels tech</th>
              <th className="num">Cancels billing</th><th className="num">Reviews</th><th className="num">Safety</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const c = officeTotals(g.list, 'c'), p = officeTotals(g.list, 'p');
              return (
                <tr key={g.key} className={g.all ? 'total-row' : ''} onClick={() => onPick(g.key)}>
                  <td><button type="button" className="who-name link" onClick={() => onPick(g.key)}>{g.name}</button></td>
                  {bonusesOn && <td className="num"><span className="money-good">{money0(c.incentive)}</span></td>}
                  <td className="num">{c.qualified} / {c.total}{bonusesOn && c.held > 0 && <span className="pill pill-bad"> {c.held} on hold</span>}</td>
                  <td className="num">{c.sold}</td>
                  <td className="num"><strong>{c.salesDone}</strong></td>
                  <td className="num">{c.autopay}</td>
                  <td className="num">{c.serv.toLocaleString()}</td>
                  <td className="num">{fmtPct(c.comp)}</td>
                  <td className="num">{fmtPct(c.resv)}</td>
                  <td className="num">{c.cxTech}</td>
                  <td className="num">{c.cxBilling}</td>
                  <td className="num">{c.stars}</td>
                  <td className="num">{c.safety ?? '—'} <Arrow cur={c.safety} prior={p.safety} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Glossary({ R, bonusesOn }) {
  const reasons = (k) => (Array.isArray(R[k]) && R[k].length ? R[k].join(', ') : 'none set');
  const items = [
    ['Service (FieldRoutes)', null],
    ['Completed', 'Appointments marked Completed in FieldRoutes and credited to you as the tech who serviced them.'],
    ['Completion', 'Jobs on your route when the morning route is saved (just after 7 AM) that you completed that same day. Jobs that get rescheduled, cancelled or finished by someone else count as missed. Today’s jobs count once they’re done, so your number doesn’t dip during the day. Routes have been saved since November 14, 2026.'],
    ['Sold', 'New customers entered in FieldRoutes with you as the salesperson, counted on the day the account was created. Used for competitions.'],
    ['Serviced', 'Your sales whose first (initial) service was completed during the period, counted on the day it was completed, whoever did the service. These are the ones that pay.'],
    ['Auto-pay added', 'Customers who turned on auto-pay on a day you completed a job for them. Tracked since November 13, 2026.'],
    ['Reservice rate', 'Reservices and incomplete services traced back to you, divided by your completed jobs. A reservice counts against the last tech who completed a regular service for that customer before it. Partial reservices (weather and rain-outs) never count.'],
    ['Cancels (tech)', `Customers who cancelled for a service reason, charged to the last tech who serviced them. Reasons: ${reasons('cancel_tech_reasons')}.`],
    ['Cancels (billing)', `Customers who cancelled over billing, charged the same way but never counted against you. Reasons: ${reasons('cancel_billing_reasons')}. Moves and every other reason never count.`],
    ['Reviews', `FieldRoutes reviews left for appointments you serviced. Top reviews are ${num(R.star_min) || 5} stars. Podium reviews are coming.`],
    ['Driving (Samsara)', null],
    ['Safety', 'Samsara’s safety score from 0 to 100. It comes from your Samsara driver profile, or from your truck until you’re set up as a driver. Speeding, phone use, harsh driving and other events take points off, scaled to the miles you drove.'],
    ['Distracted driving', 'Phone use and other distraction events caught by the dash cam.'],
  ];
  if (bonusesOn) {
    items.push(['Incentives', null],
      ['Qualifying', `${R.min_served} completed jobs a month (prorated for weeks and part-months). Under that, only sales serviced pay.`],
      ['Amounts', 'Monthly amounts are prorated to the period. Review and sale amounts are per item.'],
      ...(num(R.drive_gate) > 0 ? [['Driving cutoff', `A safety score under ${R.drive_gate} puts every bonus for that period on hold.`]] : []));
  }
  return (
    <details className="glossary spaced" open>
      <summary><h2>What the numbers mean</h2></summary>
      <dl>
        {items.map(([k, v]) => (v === null
          ? <dt key={k} className="gl-group">{k}</dt>
          : <div key={k} className="gl-row"><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>
    </details>
  );
}
