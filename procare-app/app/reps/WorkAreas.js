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
        const where = t.in_city ? (near.length ? `${t.in_city} in ${t.cities[0].city}, ${t.stops - t.in_city} within 6 mi` : `in ${t.cities[0].city}`)
          : near.map((c) => `${c.city}, ${c.miles} mi away`).join(' · ');
        return (
          <li key={t.tech} title={t.cities.map((c) => `${c.city}${c.miles ? ` (${c.miles} mi)` : ''}: ${plural(c.stops, 'stop')}`).join('\n')}>
            <Face person={t} size={20} />
            <span><b>{t.first_name} {t.last_name}</b> did {plural(t.stops, 'job')} <small>{where}</small></span>
          </li>
        );
      })}
    </ul>
  );
}

const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

/** Day by day: which route to book a sale on, best first. */
function Booking({ list, spotsLoaded }) {
  if (!spotsLoaded) return <span className="wa-none">Open spots are still loading from FieldRoutes.</span>;
  const days = [];
  const byDay = {};
  for (const p of list) { if (!byDay[p.date]) days.push((byDay[p.date] = { date: p.date, picks: [] })); byDay[p.date].picks.push(p); }
  const open = days.filter((d) => d.picks.some((p) => p.open_spots > 0));
  if (!open.length) return <span className="wa-none">No open spots near here in the next 7 days.</span>;
  return (
    <ol className="wa-days">
      {open.map((d) => (
        <li key={d.date}>
          <span className="wa-day">{weekday(d.date)}</span>
          <ul className="wa-picks">
            {d.picks.filter((p) => p.open_spots > 0).map((p, i) => (
              <li key={p.route_id || `${p.route}-${i}`} className={i === 0 ? 'best' : ''}>
                {p.tech ? <Face person={p} size={20} /> : <Bug kind="ant" size={20} color="var(--forest)" />}
                <span>
                  <b>{p.tech ? `${p.first_name} ${p.last_name}` : p.route || 'Open route'}</b>
                  {i === 0 && <em className="wa-best">Best pick</em>}
                  {' '}{plural(p.open_spots, 'open spot')}{p.open_times?.length ? ` (${p.open_times.slice(0, 4).join(', ')}${p.open_times.length > 4 ? '…' : ''})` : ''}
                  <small>
                    {p.miles === null || p.miles === undefined
                      ? `No stops booked yet${p.is_initial ? ' · Initials route' : ''}`
                      : `${p.miles === 0 ? `Already has a job in ${p.near_city}` : `Closest job ${p.miles} mi away in ${p.near_city}`} · ${plural(p.close_jobs, 'job')} within 6 mi${p.is_initial ? ' · Initials route' : ''}`}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export default function WorkAreas({ data, office, label, isCurrent, meId }) {
  if (!data) return <p className="note">Work areas are for the sales team and leadership.</p>;
  const techs = {};
  for (const t of data.techs || []) (techs[`${t.rep}|${t.area}|${t.win}`] ||= []).push(t);
  const booking = {};
  for (const p of data.days || []) (booking[`${p.rep}|${p.area}`] ||= []).push(p);

  const reps = [];
  const byRep = {};
  for (const a of data.areas || []) {
    if (office !== 'all' && a.home_office !== office) continue;
    if (!byRep[a.rep]) reps.push((byRep[a.rep] = { ...a, areas: [], pins: 0 }));
    byRep[a.rep].areas.push(a);
    byRep[a.rep].pins += a.pins;
  }
  reps.sort((a, b) => (b.rep === meId) - (a.rep === meId) || b.pins - a.pins);   // your own areas first

  const firstPick = (rep, city) => (booking[`${rep}|${city}`] || []).find((p) => p.open_spots > 0);

  return (
    <section className="rc-block">
      <div className="rc-block-head"><h2>Work areas</h2><span className="rc-label">Where each rep knocked · {label}</span></div>
      <p className="note">Cities where a rep dropped 5 or more pins. <b>Where to book next</b> lists, for each day this week, the routes with open spots closest to where the rep knocked: best pick first. Miles are from the middle of the rep’s pins to the city of the route’s closest job. <b>Techs who worked nearby</b> shows jobs done in or within 6 miles of the area during the period above. Tap a rep or a city to open it.</p>
      {!data.cities_loaded && <p className="note wa-warn">Customer cities are still loading from FieldRoutes, so techs will show up after the next sync.</p>}
      {reps.length ? reps.map((r) => (
        <details key={r.rep} className={`wa-rep${r.rep === meId ? ' wa-me' : ''}`} open={r.rep === meId}>
          <summary className="wa-rep-head">
            <Face person={r} size={36} />
            <div>
              <h3>{r.first_name} {r.last_name}{r.rep === meId && <em className="wa-you">You</em>}</h3>
              <span className="rc-label">{plural(r.pins, 'pin')} in {plural(r.areas.length, 'area')} · {r.areas.slice(0, 3).map((a) => a.city).join(', ')}{r.areas.length > 3 ? '…' : ''}</span>
            </div>
            <span className="wa-caret" aria-hidden="true">⌄</span>
          </summary>
          <ul className="wa-areas">
            {r.areas.map((a, i) => {
              const pick = firstPick(r.rep, a.city);
              return (
                <li key={a.city}>
                  <details className="wa-area-box" open={r.rep === meId && i === 0}>
                    <summary className="wa-area-sum">
                      <span><b>{a.city}</b> <span className="wa-pins">{plural(a.pins, 'pin')}</span></span>
                      <small>{pick ? `Next best: ${weekday(pick.date)}, ${pick.tech ? `${pick.first_name} ${pick.last_name}` : pick.route || 'open route'} (${plural(pick.open_spots, 'open spot')})` : 'No open spots nearby this week'}</small>
                      <span className="wa-caret" aria-hidden="true">⌄</span>
                    </summary>
                    <div className="wa-area">
                      <div className="wa-where">
                        <span className="wa-meta">{span(a)}</span>
                        <span className="wa-meta">{plural(a.convos, 'conversation')} · {plural(a.sales, 'sale')}{a.zips?.length ? ` · zip ${a.zips.join(', ')}` : ''}</span>
                      </div>
                      <div className="wa-col wa-book">
                        <span className="rc-label">Where to book next</span>
                        <Booking list={booking[`${r.rep}|${a.city}`] || []} spotsLoaded={data.spots_loaded} />
                      </div>
                      <div className="wa-col">
                        <span className="rc-label">Techs who worked nearby {isCurrent ? 'this period' : 'then'}</span>
                        <Techs list={techs[`${r.rep}|${a.city}|period`] || []} empty="No tech jobs in or near here." />
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </details>
      )) : <p className="note rc-empty"><Bug kind="ant" size={28} color="var(--forest)" /> No area with 5 or more pins in this period.</p>}
    </section>
  );
}
