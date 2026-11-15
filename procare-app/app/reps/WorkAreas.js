'use client';

import Face from '../Face';
import Bug from '../Bug';

const TZ = 'America/New_York';
const day = (t) => new Date(t).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
const hour = (t) => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "Nov 3 – Nov 12 · 4 days", or "Nov 12, 2:05 PM – 5:40 PM" for one day. */
function span(a) {
  if (day(a.first_pin) === day(a.last_pin)) return `${day(a.first_pin)}, ${hour(a.first_pin)} – ${hour(a.last_pin)}`;
  return `${day(a.first_pin)} – ${day(a.last_pin)} · ${plural(a.days, 'day')}`;
}

function Techs({ list, empty }) {
  if (!list.length) return <span className="wa-none">{empty}</span>;
  return (
    <ul className="wa-techs">
      {list.map((t) => {
        const near = t.cities.filter((c) => c.miles > 0);
        const where = t.in_city ? (near.length ? `${t.in_city} in town, ${t.stops - t.in_city} nearby` : 'in town')
          : `nearby: ${near.map((c) => `${c.city} ${c.miles} mi`).join(', ')}`;
        return (
          <li key={t.tech} title={t.cities.map((c) => `${c.city}${c.miles ? ` (${c.miles} mi)` : ''}: ${plural(c.stops, 'stop')}`).join('\n')}>
            <Face person={t} size={20} />
            <span><b>{t.first_name} {t.last_name}</b> {plural(t.stops, 'stop')} <small>{where}</small></span>
          </li>
        );
      })}
    </ul>
  );
}

export default function WorkAreas({ data, office, label, isCurrent }) {
  if (!data) return <p className="note">Work areas are only for sales managers and the President.</p>;
  const techs = {};
  for (const t of data.techs || []) (techs[`${t.rep}|${t.area}|${t.win}`] ||= []).push(t);

  const reps = [];
  const byRep = {};
  for (const a of data.areas || []) {
    if (office !== 'all' && a.home_office !== office) continue;
    if (!byRep[a.rep]) reps.push((byRep[a.rep] = { ...a, areas: [], pins: 0 }));
    byRep[a.rep].areas.push(a);
    byRep[a.rep].pins += a.pins;
  }
  reps.sort((a, b) => b.pins - a.pins);

  return (
    <section className="rc-block">
      <div className="rc-block-head"><h2>Work areas</h2><span className="rc-label">Where each rep knocked · {label}</span></div>
      <p className="note">Cities where a rep dropped 5 or more pins. Techs are anyone with jobs in that city or a city within 6 miles, during this period and in the next 7 days.</p>
      {!data.cities_loaded && <p className="note wa-warn">Customer cities are still loading from FieldRoutes, so techs will show up after the next sync.</p>}
      {reps.length ? reps.map((r) => (
        <article key={r.rep} className="wa-rep">
          <header className="wa-rep-head">
            <Face person={r} size={36} />
            <div><h3>{r.first_name} {r.last_name}</h3><span className="rc-label">{plural(r.pins, 'pin')} in {plural(r.areas.length, 'area')}</span></div>
          </header>
          <ul className="wa-areas">
            {r.areas.map((a) => (
              <li key={a.city} className="wa-area">
                <div className="wa-where">
                  <h4>{a.city}</h4>
                  <span className="wa-pins">{plural(a.pins, 'pin')}</span>
                  <span className="wa-meta">{span(a)}</span>
                  <span className="wa-meta">{plural(a.convos, 'conversation')} · {plural(a.sales, 'sale')}{a.zips?.length ? ` · zip ${a.zips.join(', ')}` : ''}</span>
                </div>
                <div className="wa-col">
                  <span className="rc-label">{isCurrent ? 'Techs there this period' : 'Techs there then'}</span>
                  <Techs list={techs[`${r.rep}|${a.city}|period`] || []} empty="No tech jobs in or near here." />
                </div>
                <div className="wa-col">
                  <span className="rc-label">Next 7 days</span>
                  <Techs list={techs[`${r.rep}|${a.city}|next`] || []} empty="None scheduled yet." />
                </div>
              </li>
            ))}
          </ul>
        </article>
      )) : <p className="note rc-empty"><Bug kind="ant" size={28} color="var(--forest)" /> No area with 5 or more pins in this period.</p>}
    </section>
  );
}
