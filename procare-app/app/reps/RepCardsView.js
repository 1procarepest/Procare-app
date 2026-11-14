'use client';

import Link from 'next/link';
import { useState } from 'react';
import Face from '../Face';
import Bug, { BugTile } from '../Bug';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { initialsOf } from '@/lib/photo';
import { LEADER_TITLE, OUTCOMES, VIEWS, byStanding, leaders, money0, one, pct0, shiftPeriod } from '@/lib/repcards';
import RepCard, { SalesSide } from './RepCard';

const href = (view, date) => `/reps?view=${view}&date=${date}`;
const OFFICE_BUG = { east: 'ant', south: 'stinging', west: 'mosquito' };
const LEADER_ART = {
  services: ['roach', 'ink'], new: ['ant', 'forest'], convos: ['cricket', 'lime'], hours: ['termite', 'sage'], close: ['spider', 'forest'],
  cv: ['stinging', 'ink'], far: ['centipede', 'lime'], s2s: ['tick', 'forest'], info: ['earwig', 'sage'], pace: ['mosquito', 'ink'], doors: ['ant', 'lime'],
};

function Panel({ title, summary, children, open: startOpen = true }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section className="rc-panel">
      <button type="button" className="rc-panel-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2>{title}</h2>
        <span className="rc-panel-sum">{summary} <span className={`rc-caret${open ? ' open' : ''}`} aria-hidden="true">⌄</span></span>
      </button>
      {open && <div className="rc-panel-body">{children}</div>}
    </section>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="rc-tile">
      <span className="rc-label">{label}</span>
      <span className="rc-tile-val">{value}</span>
      {sub && <span className="rc-tile-sub">{sub}</span>}
    </div>
  );
}

function Totals({ m }) {
  const kinds = [m.pest && `${m.pest} pest`, m.termite && `${m.termite} termite`, m.mosquito && `${m.mosquito} mosquito`].filter(Boolean).join(' · ');
  return (
    <div className="rc-tiles">
      <Tile label="Services sold" value={m.services} sub={kinds || 'none yet'} />
      <Tile label="Future annual revenue" value={money0(m.far)} sub={m.services ? `${money0(m.farPerService)} per service sold` : null} />
      <Tile label="Avg 1st year pest control CV" value={m.avgPest === null ? '—' : money0(m.avgPest)} sub={m.pest ? `average of ${m.pest} pest services sold` : null} />
      <Tile label="New customers" value={m.new_customers} sub={`${m.canceled} canceled · ${pct0(m.autopayRate)} autopay`} />
      <Tile label="Sales to service" value={pct0(m.saleToService)} sub={`${m.serviced} of ${m.dueBase} services due were serviced`} />
      <Tile label="Close rate" value={pct0(m.closeRate)} sub="new customers ÷ conversations" />
      <Tile label="Doors" value={m.doors} sub={`${m.field_days} field day${m.field_days === 1 ? '' : 's'}`} />
      <Tile label="Hours" value={one(m.hours)} sub={`${one(m.doorsPerHour)} doors per hour`} />
      <Tile label="Conversations" value={m.convos} sub={`${pct0(m.contactRate)} contact · ${m.call_back} call backs`} />
      <Tile label="Customer info" value={m.info} sub={`${pct0(m.infoRate)} of doors`} />
    </div>
  );
}

function OfficeCards({ offices }) {
  const list = OFFICES.filter((o) => offices[o.key]).map((o) => ({ ...o, m: offices[o.key] }));
  const empty = OFFICES.filter((o) => !offices[o.key]);
  const ranked = list.sort((a, b) => b.m.services - a.m.services || b.m.new_customers - a.m.new_customers);
  return (
    <div className="rc-roster">
      {ranked.map((o, i) => (
        <article key={o.key} className="rc rc-office-card">
          <div className="rc-face rc-back rc-static">
            <Bug kind={OFFICE_BUG[o.key]} size={170} className="rc-mark" />
            <div className="rc-head">
              <span className="face face-initials rc-office-badge" aria-hidden="true">{initialsOf(...o.name.split(' '))}</span>
              <div className="rc-who">
                <h3>{o.name}</h3>
                <span className="rc-office">{o.m.reps} rep{o.m.reps === 1 ? '' : 's'} active · {o.m.field_days} field day{o.m.field_days === 1 ? '' : 's'}</span>
              </div>
              <span className="rc-rank">#{i + 1}</span>
            </div>
            <SalesSide m={o.m} withDoors />
          </div>
        </article>
      ))}
      {empty.map((o) => (
        <article key={o.key} className="rc rc-office-card rc-quiet">
          <div className="rc-face rc-back rc-static">
            <Bug kind={OFFICE_BUG[o.key]} size={170} className="rc-mark" />
            <div className="rc-head">
              <span className="face face-initials rc-office-badge" aria-hidden="true">{initialsOf(...o.name.split(' '))}</span>
              <div className="rc-who"><h3>{o.name}</h3><span className="rc-office">0 reps active</span></div>
            </div>
            <p className="rc-none">No doors or sales in this period.</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function Leaders({ list }) {
  if (!list.length) return null;
  return (
    <div className="rc-leaders">
      {list.map((L) => (
        <div key={L.key} className="rc-leader">
          <span className="rc-leader-top"><span className="rc-label">{L.title}</span><BugTile kind={LEADER_ART[L.key][0]} tone={LEADER_ART[L.key][1]} size={34} /></span>
          <span className="rc-leader-who">
            <Face person={{ photo_url: L.rep.photo, first_name: L.rep.first_name, last_name: L.rep.last_name }} size={30} />
            <span>{L.rep.name}</span>
          </span>
          <span className="rc-tile-val">{L.show(L.v)}</span>
          <span className="rc-tile-sub">{L.sub}</span>
        </div>
      ))}
    </div>
  );
}

function Glossary() {
  const items = [
    ['Doors', 'Every pin a rep dropped in FieldRoutes, counted on the day it was dropped.'],
    ['Conversations', 'Doors marked Made Sale, Call Back, Gave Pitch or Not Interested. Contact = conversations ÷ doors.'],
    ['Customer info', 'Doors where the rep saved a name, phone or email.'],
    ['Hours', 'For each day, the time between a rep’s doors and sales, leaving out any gap longer than an hour (lunch, driving home). Office hours split a rep’s day by office.'],
    ['Services sold', 'Recurring General Pest, Termite and Mosquito services with a first appointment, credited to the first salesperson on the account, counted on the day it was sold. One-time services and sales without a first appointment don’t count, the same as the Sales Report.'],
    ['New customers', 'Different customers among the services sold (one customer can buy pest and termite).'],
    ['Canceled', 'Sales whose first service was cancelled. They’re left out of services sold, new customers, autopay and revenue.'],
    ['Close rate', 'New customers ÷ conversations.'],
    ['Pending / Serviced / Due', 'Serviced: first service completed. Pending: not done yet. Due: missed (no-show) or scheduled for today or earlier and not done yet.'],
    ['Sale→Svc (sales to service)', 'Serviced ÷ (serviced + due + canceled): of the sales whose first service should have happened, how many did.'],
    ['Autopay', 'New customers with a card or bank account on autopay in FieldRoutes.'],
    ['Future annual revenue', 'A year of each service’s recurring price: billed monthly ×12, every 60 days ×6, quarterly ×4, yearly ×1; billed after each service ×4 (Mosquito ×7). Custom billing: $50 or less ×12, under $400 ×4, else ×1.'],
    ['Avg 1st year contract value', 'A year of recurring billing plus the initial price, averaged per service (Mosquito billed after each service counts 6 visits, since the initial is the 7th).'],
    ['52-week table', 'CPH = conversations per hour. IPH = customer info per hour. C2S = conversations per sale. C2S% = sales ÷ conversations.'],
    ['Leaders', 'Top closer needs 10+ conversations, top pest CV 2+ pest sales, best sales to service 3+ due, fastest pace 1+ hour.'],
  ];
  return (
    <details className="glossary spaced">
      <summary><h2>What the numbers mean</h2></summary>
      <dl>{items.map(([k, v]) => <div key={k} className="gl-row"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </details>
  );
}

export default function RepCardsView({ view, date, today, label, isCurrent, reps, offices, team, meId, syncedAt }) {
  const [office, setOffice] = useState('all');
  const shown = reps.filter((r) => office === 'all' || r.office === office).sort(byStanding);
  const m = office === 'all' ? team : offices[office];
  const officeRank = OFFICES.filter((o) => offices[o.key])
    .sort((a, b) => offices[b.key].services - offices[a.key].services || offices[b.key].new_customers - offices[a.key].new_customers)[0];
  const updated = syncedAt
    ? new Date(syncedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  const next = shiftPeriod(view, date, 1);

  return (
    <>
      <div className="rc-top bug-band">
        <div>
          <p className="rc-kicker">Door-to-door + sales</p>
          <h1 className="rc-title">Rep <em>Cards</em></h1>
        </div>
        {updated && <p className="rc-updated">Updated {updated} ET</p>}
      </div>

      <div className="rc-controls">
        <nav className="rc-seg" aria-label="Period">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href(v.key, date)} className={v.key === view ? 'on' : ''} aria-current={v.key === view ? 'page' : undefined} scroll={false}>{v.label}</Link>
          ))}
        </nav>
        <div className="rc-step">
          <Link className="rc-arrow" href={href(view, shiftPeriod(view, date, -1))} aria-label="Earlier" scroll={false}>‹</Link>
          <span className="rc-range">{label}</span>
          {isCurrent
            ? <span className="rc-arrow off" aria-hidden="true">›</span>
            : <Link className="rc-arrow" href={href(view, next > today ? today : next)} aria-label="Later" scroll={false}>›</Link>}
        </div>
        <select className="rc-office-pick" value={office} onChange={(e) => setOffice(e.target.value)} aria-label="Office">
          <option value="all">All offices</option>
          {OFFICES.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
        </select>
      </div>

      <Panel title={office === 'all' ? 'Team Totals' : `${OFFICE_NAME[office]} Totals`} summary={`${m?.services || 0} services sold · ${money0(m?.far)}`}>
        {m ? <Totals m={m} /> : <p className="note">No doors or sales in this period.</p>}
      </Panel>

      <Panel title="Office Standings" summary={officeRank ? `#1 ${officeRank.name}` : ''} open={false}>
        <p className="note">Ranked by services sold, then new customers. Each door and sale counts for the office it’s in.</p>
        <OfficeCards offices={offices} />
      </Panel>

      <section className="rc-block">
        <div className="rc-block-head"><h2>{isCurrent ? LEADER_TITLE[view] : 'Leaders'}</h2><span className="rc-label">Who’s on top</span></div>
        <Leaders list={leaders(shown)} />
      </section>

      <section className="rc-block">
        <div className="rc-block-head"><h2>The roster</h2><span className="rc-label">Ranked by services sold, then new customers</span></div>
        <ul className="rc-legend">
          {OUTCOMES.map((o) => (
            <li key={o.key}><span className="rc-dot" style={{ background: o.color }} aria-hidden="true" />{o.label}{o.note && <small> ({o.note})</small>}</li>
          ))}
        </ul>
        {shown.length
          ? <div className="rc-roster">{shown.map((r) => <RepCard key={r.id} rep={r} me={r.id === meId} />)}</div>
          : <p className="note rc-empty"><Bug kind="ant" size={28} color="var(--forest)" /> No doors or sales in this period yet.</p>}
      </section>

      <Glossary />
    </>
  );
}
