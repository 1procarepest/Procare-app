'use client';

import { useMemo, useState } from 'react';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { calcPay, money, money0, num, pct } from '@/lib/scorecard';

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
    prod: num(m.prod),
    comp: num(m.routed) ? pct(m.route_done, m.routed) : null,
    routed: num(m.routed),
    routeDone: num(m.route_done),
    resvN: num(m.reservices) + num(m.incompletes),
    resv: num(m.serv) ? pct(num(m.reservices) + num(m.incompletes), m.serv) : null,
    partials: num(m.partials),
    salesDone: num(m.sales_done),
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
  return t.photo
    ? <img className="face" src={t.photo} alt="" width={size} height={size} />
    : <span className="face face-initials" style={{ width: size, height: size }} aria-hidden="true">{initials(t.name)}</span>;
}

export default function ScorecardView({ techs, R, per, period, meId }) {
  const scale = num(per.scale);
  const bonusesOn = !!R.bonuses_on;
  const [tab, setTab] = useState('techs');
  const [office, setOffice] = useState('all');
  const [sort, setSort] = useState({ key: bonusesOn ? 'incentive' : 'rank', dir: -1 });
  const [picked, setPicked] = useState(meId);

  const rows = useMemo(() => {
    const list = techs.map((t) => ({ ...t, c: measure(t.cur, R, scale), p: measure(t.prior, R, scale) }))
      .filter((t) => t.c && (t.c.sched > 0 || t.c.routed > 0 || t.c.safety !== null || t.id === meId));
    // Rank: qualified techs by incentive when bonuses are on, otherwise by production.
    const value = (t) => (bonusesOn ? t.c.pay.total : t.c.prod);
    list.filter((t) => t.c.pay.qualified).sort((a, b) => value(b) - value(a) || b.c.prod - a.c.prod).forEach((t, i) => { t.rank = i + 1; });
    return list;
  }, [techs, R, scale, bonusesOn, meId]);

  const shown = rows.filter((t) => office === 'all' || t.office === office);
  const sortVal = {
    rank: (t) => (t.rank ? -t.rank : -9999),
    name: (t) => t.name,
    incentive: (t) => t.c.pay.total,
    sales: (t) => t.c.salesDone,
    serv: (t) => t.c.serv,
    prod: (t) => t.c.prod,
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
            <p className="note">Click a column to sort and a technician to see their breakdown. Arrows compare with {period.prior}.</p>
            <div className="board-wrap">
              <table className="board">
                <thead>
                  <tr>
                    <Th k="name" num={false}>Technician</Th>
                    {bonusesOn && <Th k="incentive">Incentive</Th>}
                    <Th k="sales">Sales</Th>
                    <Th k="serv">Completed</Th>
                    <Th k="prod">Production</Th>
                    <Th k="comp">Completion</Th>
                    <Th k="resv">Reservice</Th>
                    <Th k="cxTech">Cancels tech</Th>
                    <Th k="cxBilling">Cancels billing</Th>
                    <Th k="stars">Reviews</Th>
                    <Th k="safety">Safety</Th>
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
                      {bonusesOn && (
                        <td className="num">
                          {!t.c.pay.qualified ? <span className="pill">Under {t.c.pay.minServed}</span>
                            : t.c.pay.gated ? <span className="pill pill-bad">On hold</span>
                            : <span className="money-good">{money0(t.c.pay.total)} <Arrow cur={t.c.pay.total} prior={t.p?.pay.total} /></span>}
                        </td>
                      )}
                      <td className="num">{t.c.salesDone} <Arrow cur={t.c.salesDone} prior={t.p?.salesDone} /><span className="cell-sub">{t.c.sold} sold</span></td>
                      <td className="num">{t.c.serv} <Arrow cur={t.c.serv} prior={t.p?.serv} /></td>
                      <td className="num">{money0(t.c.prod)} <Arrow cur={t.c.prod} prior={t.p?.prod} /></td>
                      <td className="num">{fmtPct(t.c.comp)} <Arrow cur={t.c.comp} prior={t.p?.comp} /></td>
                      <td className="num">{fmtPct(t.c.resv)} <Arrow cur={t.c.resv} prior={t.p?.resv} lowerIsBetter /></td>
                      <td className="num">{t.c.cxTech ? <span className="ring">{t.c.cxTech}</span> : 0}</td>
                      <td className="num">{t.c.cxBilling}</td>
                      <td className="num">{t.c.stars} <Arrow cur={t.c.stars} prior={t.p?.stars} />{t.c.rating !== null && <span className="cell-sub">{t.c.rating}★ avg</span>}</td>
                      <td className="num">{t.c.safety ?? '—'} <Arrow cur={t.c.safety} prior={t.p?.safety} /></td>
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
        {bonusesOn && pay.gated && <span className="pill pill-bad">On hold: driving under {R.drive_gate}</span>}
      </div>

      <div className="bd-lines">
        <Line label="Completed jobs" value={c.serv}><Arrow cur={c.serv} prior={p.serv} /></Line>
        <Line label="Completion" value={c.routed ? `${fmtPct(c.comp)} (${c.routeDone} of ${c.routed})` : 'No routes saved yet'}><Arrow cur={c.comp} prior={p.comp} /></Line>
        <Line label="Production" value={money0(c.prod)}><Arrow cur={c.prod} prior={p.prod} /></Line>
        <Line label="Sales sold / serviced" value={`${c.sold} / ${c.salesDone} (${money0(c.salesDoneValue)})`} />
        <Line label="Reservices" value={`${c.resvN} (${fmtPct(c.resv)})`}><Arrow cur={c.resv} prior={p.resv} lowerIsBetter /></Line>
        {c.partials > 0 && <Line label="Weather partials (not counted)" value={c.partials} />}
        <Line label="Cancels: tech / billing" value={`${c.cxTech} / ${c.cxBilling}`} />
        <Line label="Reviews" value={`${c.stars} top of ${c.reviews}${c.rating !== null ? `, ${c.rating}★` : ''}`} />
        <Line label="Safety" value={c.safety === null ? 'No driving' : `${c.safety} · ${c.miles.toLocaleString()} mi`}><Arrow cur={c.safety} prior={p.safety} /></Line>
        {c.safety !== null && <Line label="Distracted driving" value={c.distracted} />}
        {c.safety !== null && <p className="note">Safety comes from {c.driveSource === 'driver' ? 'their Samsara driver profile' : 'their truck (not set up as a Samsara driver yet)'}.</p>}
      </div>

      {bonusesOn ? (
        <div className="bd-lines bd-pay">
          <Line label={`Completion ${fmtPct(c.comp)}`} value={money(pay.completion)} />
          <Line label={`Production over ${money0(pay.floor)}`} value={money(pay.production)} />
          <Line label={`${c.stars} top reviews × ${money0(R.star_amt)}`} value={money(pay.stars)} />
          {(num(R.drive_hi_amt) > 0 || num(R.drive_lo_amt) > 0) && (
            <Line label={`Safe driving${pay.distractedCap ? ` (over ${pay.distractedMax} distracted)` : c.safety !== null ? ` (score ${c.safety})` : ''}`} value={money(pay.driving)} />
          )}
          <Line label={`Sales serviced ${c.salesDone} × ${money0(R.sale_amt)}`} value={money(pay.sales)} />
          {pay.cancelPenalty > 0 && <Line label={`${c.cxTech} tech-caused cancels`} value={`−${money(pay.cancelPenalty)}`} />}
          {pay.gated && <Line label="On hold (driving score)" value={`−${money(pay.held)}`} />}
          <div className="bd-total"><span>Incentive{per.in_progress ? ' so far' : ''}</span><span className="num">{money(pay.total)}</span></div>
        </div>
      ) : (
        <p className="note bd-pay">Bonus amounts haven’t been set yet. These numbers still count, and the incentive will show here once they are.</p>
      )}
    </div>
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
        <table className="board">
          <thead>
            <tr>
              <th>Office</th>
              {bonusesOn && <th className="num">Incentives</th>}
              <th className="num">Qualified techs</th><th className="num">Sales</th><th className="num">Completed</th>
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
                  {bonusesOn && <td className="num"><span className="money-good">{money0(c.incentive)}</span> <Arrow cur={c.incentive} prior={p.incentive} /></td>}
                  <td className="num">{c.qualified} / {c.total}{bonusesOn && c.held > 0 && <span className="pill pill-bad"> {c.held} on hold</span>}</td>
                  <td className="num">{c.salesDone} <Arrow cur={c.salesDone} prior={p.salesDone} /><span className="cell-sub">{c.sold} sold</span></td>
                  <td className="num">{c.serv.toLocaleString()} <Arrow cur={c.serv} prior={p.serv} /></td>
                  <td className="num">{fmtPct(c.comp)} <Arrow cur={c.comp} prior={p.comp} /></td>
                  <td className="num">{fmtPct(c.resv)} <Arrow cur={c.resv} prior={p.resv} lowerIsBetter /></td>
                  <td className="num">{c.cxTech} <Arrow cur={c.cxTech} prior={p.cxTech} lowerIsBetter /></td>
                  <td className="num">{c.cxBilling}</td>
                  <td className="num">{c.stars} <Arrow cur={c.stars} prior={p.stars} /></td>
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
    ['Production', 'Total FieldRoutes production value of your completed appointments.'],
    ['Sales sold', 'Subscriptions entered in FieldRoutes in your name during the period.'],
    ['Sales serviced', 'Sales in your name whose first service was completed during the period. These are the ones that pay.'],
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
