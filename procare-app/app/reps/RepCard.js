'use client';

import { useState } from 'react';
import Face from '../Face';
import Bug, { BUGS } from '../Bug';
import { OFFICE_NAME } from '@/lib/labels';
import { OUTCOMES, money0, one, pct0 } from '@/lib/repcards';

const shortWeek = (ymd) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Thin bar showing the share of each door outcome. */
export function OutcomeBar({ m }) {
  const total = OUTCOMES.reduce((s, o) => s + m[o.key], 0);
  return (
    <div className="rc-bar" role="img" aria-label={total ? OUTCOMES.map((o) => `${o.label} ${m[o.key]}`).join(', ') : 'No doors'}>
      {total > 0 && OUTCOMES.map((o) => (m[o.key] ? <span key={o.key} style={{ width: `${(m[o.key] / total) * 100}%`, background: o.color }} /> : null))}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="rc-stat"><span className="rc-label">{label}</span><span className="rc-val">{value}</span></div>;
}

/** Pest / termite / mosquito chips (and canceled, when there are any). */
function ServiceChips({ m }) {
  return (
    <div className="rc-chips">
      <span className={`rc-chip${m.pest ? ' on' : ''}`}><Bug kind="roach" size={14} />Pest {m.pest}</span>
      <span className={`rc-chip${m.termite ? ' on' : ''}`}><Bug kind="termite" size={14} />Termite {m.termite}</span>
      <span className={`rc-chip${m.mosquito ? ' on' : ''}`}><Bug kind="mosquito" size={14} />Mosquito {m.mosquito}</span>
      {m.canceled > 0 && <span className="rc-chip rc-chip-cx">{m.canceled} canceled</span>}
    </div>
  );
}

/** The dark sales side: shared by a rep's card (flipped) and the office cards. */
export function SalesSide({ m, withDoors }) {
  const [showCv, setShowCv] = useState(false);
  return (
    <>
      <div className="rc-hero">
        <div><span className="rc-big">{m.services}</span><span className="rc-cap">Services Sold</span></div>
        <div className="rc-hero-right"><span className="rc-mid">{pct0(m.closeRate)}</span><span className="rc-cap">close rate</span></div>
      </div>
      <div className="rc-far">
        <div className="rc-far-row"><span className="rc-label">Future annual revenue</span><span className="rc-far-val">{money0(m.far)}</span></div>
        <button type="button" className="rc-far-btn" aria-expanded={showCv} onClick={(e) => { e.stopPropagation(); setShowCv((v) => !v); }}>
          {showCv ? '⌄ Hide' : '› Click to show'} avg contract values
        </button>
        {showCv && (
          <dl className="rc-cv">
            <div><dt>Pest</dt><dd>{m.avgPest === null ? '—' : money0(m.avgPest)}</dd></div>
            <div><dt>Termite</dt><dd>{m.avgTermite === null ? '—' : money0(m.avgTermite)}</dd></div>
            <div><dt>Mosquito</dt><dd>{m.avgMosquito === null ? '—' : money0(m.avgMosquito)}</dd></div>
          </dl>
        )}
      </div>
      <div className="rc-grid rc-grid-lime">
        <Stat label="New customers" value={m.new_customers} />
        <Stat label="Sale→Svc" value={pct0(m.saleToService)} />
        <Stat label="Autopay" value={pct0(m.autopayRate)} />
        <Stat label="Pending" value={m.pending} />
        <Stat label="Serviced" value={m.serviced} />
        <Stat label="Due" value={m.due} />
      </div>
      <ServiceChips m={m} />
      {withDoors && (
        <>
          <div className="rc-grid rc-rule">
            <Stat label="Doors" value={m.doors} />
            <Stat label="Hours" value={one(m.hours)} />
            <Stat label="Doors/hr" value={one(m.doorsPerHour)} />
            <Stat label="Convos" value={m.convos} />
            <Stat label="Cust. info" value={m.info} />
            <Stat label="Call backs" value={m.call_back} />
          </div>
          <OutcomeBar m={m} />
        </>
      )}
    </>
  );
}

function WeeksTable({ weeks }) {
  if (!weeks.length) return null;
  const tot = weeks.reduce((t, w) => {
    ['hours', 'doors', 'convos', 'services', 'info'].forEach((k) => { t[k] += w.m[k]; });
    return t;
  }, { hours: 0, doors: 0, convos: 0, services: 0, info: 0 });
  const row = (label, x) => {
    const r = (a, b) => (b ? a / b : null);
    return (
      <>
        <th scope="row">{label}</th>
        <td>{one(x.hours)}</td><td>{x.doors}</td><td>{x.convos}</td><td>{x.services}</td>
        <td>{one(r(x.convos, x.hours))}</td><td>{one(r(x.info, x.hours))}</td>
        <td>{x.services ? `${one(x.convos / x.services).replace(/\.0$/, '')}:1` : '—'}</td>
        <td>{x.convos ? pct0(x.services / x.convos) : '—'}</td>
      </>
    );
  };
  return (
    <div className="rc-weeks">
      <div className="rc-section"><span>Last 52 weeks</span><span>Scroll ↕</span></div>
      <div className="rc-weeks-scroll" onClick={(e) => e.stopPropagation()}>
        <table>
          <thead>
            <tr><th>Week of</th><th>Hours</th><th>Doors</th><th>Conv</th><th>Sold</th><th title="Conversations per hour">CPH</th><th title="Customer info per hour">IPH</th><th title="Conversations per sale">C2S</th><th title="Sales per conversation">C2S%</th></tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((w) => <tr key={w.week}>{row(shortWeek(w.week), w.m)}</tr>)}
          </tbody>
          <tfoot><tr>{row('Total', tot)}</tr></tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * A rep's card. Front: their door knocking. Tap to flip to their sales.
 * `rep` comes from buildCards() in lib/repcards.js.
 */
export default function RepCard({ rep, me, showWeeks = true }) {
  const [flipped, setFlipped] = useState(false);
  const { m } = rep;
  const person = { photo_url: rep.photo, first_name: rep.first_name, last_name: rep.last_name };
  const head = (
    <div className="rc-head">
      <Face person={person} size={56} />
      <div className="rc-who">
        <h3>{rep.name}</h3>
        <span className="rc-office">{OFFICE_NAME[rep.office] || 'No office'}</span>
      </div>
      {rep.rank && <span className="rc-rank">#{rep.rank}</span>}
    </div>
  );
  const flip = () => setFlipped((f) => !f);
  // each card gets its own bug in the corner, like the brand guide's icon set
  const mark = <Bug kind={BUGS[((rep.rank || 1) - 1) % BUGS.length]} size={150} className="rc-mark" />;
  return (
    <article className={`rc${flipped ? ' flipped' : ''}${me ? ' rc-me' : ''}`} onClick={flip} aria-label={`${rep.name}’s card`}>
      <div className="rc-inner">
        <div className="rc-face rc-front" aria-hidden={flipped}>
          {mark}
          {head}
          <div className="rc-section"><span>Door outcomes</span><span>{plural(m.doors, 'door')}</span></div>
          <ul className="rc-outcomes">
            {OUTCOMES.map((o) => (
              <li key={o.key}>
                <span className="rc-dot" style={{ background: o.color }} aria-hidden="true" />
                <span>{o.label}{o.note && <small> ({o.note})</small>}</span>
                <strong>{m[o.key]}</strong>
              </li>
            ))}
          </ul>
          <OutcomeBar m={m} />
          <div className="rc-grid">
            <Stat label="Doors" value={m.doors} />
            <Stat label="Hours" value={one(m.hours)} />
            <Stat label="Doors/hr" value={one(m.doorsPerHour)} />
            <Stat label="Convos" value={m.convos} />
            <Stat label="Cust. info" value={m.info} />
            <Stat label="Close rate" value={pct0(m.closeRate)} />
          </div>
          {showWeeks && <WeeksTable weeks={rep.weeks || []} />}
          <div className="rc-foot">
            <span>{plural(m.field_days, 'day')} in the field</span>
            <button type="button" className="rc-flip" tabIndex={flipped ? -1 : 0} onClick={(e) => { e.stopPropagation(); flip(); }}>Tap to flip for sales stats</button>
          </div>
        </div>
        <div className="rc-face rc-back rc-turned" aria-hidden={!flipped}>
          {mark}
          {head}
          <SalesSide m={m} />
          <div className="rc-foot">
            <span>{plural(m.field_days, 'day')} in the field</span>
            <button type="button" className="rc-flip" tabIndex={flipped ? 0 : -1} onClick={(e) => { e.stopPropagation(); flip(); }}>Tap to flip back</button>
          </div>
        </div>
      </div>
    </article>
  );
}
