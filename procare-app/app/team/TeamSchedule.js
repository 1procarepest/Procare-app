'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Face from '../Face';
import { DEPT_LABEL, OFFICES, OFFICE_NAME, roleTitle, shortDate, toMinutes } from '@/lib/labels';
import { dayFor } from '@/lib/teamSchedule';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dow = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const DEPT_TITLE = { sales: 'Sales', technician: 'Technicians', administrative: 'Office' };

export default function TeamSchedule({ data, days, today, week, weeksBack, weeksAhead, meId, myOffice }) {
  const depts = data.depts || [];
  const [dept, setDept] = useState(depts.length === 1 ? depts[0] : depts.includes('technician') ? 'technician' : depts[0]);
  const [office, setOffice] = useState('all');
  const thisWeek = days.includes(today);
  const [day, setDay] = useState(thisWeek ? today : days[0]);
  const [view, setView] = useState('day');

  // Everyone's week, worked out once
  const grid = useMemo(() => {
    const shifts = {};
    (data.schedules || []).forEach((s) => {
      if (s.s && s.x) (shifts[s.e] ||= {})[s.d] = [toMinutes(s.s), toMinutes(s.x)];
    });
    const off = {};
    (data.off || []).forEach((r) => (off[r.e] ||= []).push(r));
    return (data.people || []).map((p) => ({
      p, byDay: Object.fromEntries(days.map((d) => [d, dayFor(shifts[p.id]?.[dow(d)], off[p.id] || [], d)])),
    }));
  }, [data, days]);

  const shown = grid.filter(({ p }) => p.department === dept && (office === 'all' || p.office === office));
  const showSunday = shown.some((r) => r.byDay[days[6]].working);
  const cols = showSunday ? days : days.slice(0, 6);
  const count = (d) => shown.filter((r) => r.byDay[d].working).length;
  const working = shown.filter((r) => r.byDay[day].working).sort((a, b) => (a.byDay[day].start ?? 0) - (b.byDay[day].start ?? 0) || a.p.first_name.localeCompare(b.p.first_name));
  const notWorking = shown.filter((r) => !r.byDay[day].working);
  const byOffice = OFFICES.map((o) => ({ ...o, list: working.filter((r) => r.p.office === o.key) })).filter((o) => o.list.length);
  const verb = dept === 'sales' ? 'selling' : 'working';
  const href = (n) => (n ? `/team?week=${n}` : '/team');

  return (
    <>
      <div className="rc-top">
        <div>
          <p className="rc-kicker">Team schedule</p>
          <h1 className="rc-title">Who’s <em>{verb}</em></h1>
        </div>
        <nav className="rc-step" aria-label="Choose a week">
          {week > -weeksBack ? <Link className="rc-arrow" href={href(week - 1)} aria-label="Previous week" scroll={false}>‹</Link> : <span className="rc-arrow off">‹</span>}
          {week === 0 ? <span className="rc-range">This week</span> : <Link className="rc-range" href="/team" scroll={false}>Week of {shortDate(days[0])}</Link>}
          {week < weeksAhead ? <Link className="rc-arrow" href={href(week + 1)} aria-label="Next week" scroll={false}>›</Link> : <span className="rc-arrow off">›</span>}
        </nav>
      </div>

      <div className="rc-controls">
        <div className="calc-row">
          {depts.length > 1 && (
            <div className="rc-seg" role="group" aria-label="Department">
              {depts.map((d) => <button key={d} type="button" className={dept === d ? 'on' : ''} onClick={() => setDept(d)}>{DEPT_TITLE[d]}</button>)}
            </div>
          )}
          <div className="rc-seg" role="group" aria-label="View">
            <button type="button" className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>By day</button>
            <button type="button" className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Week</button>
          </div>
        </div>
        <select className="rc-office-pick" aria-label="Office" value={office} onChange={(e) => setOffice(e.target.value)}>
          <option value="all">All offices</option>
          {OFFICES.map((o) => <option key={o.key} value={o.key}>{o.name}{o.key === myOffice ? ' (yours)' : ''}</option>)}
        </select>
      </div>

      <div className="ts-days" role="group" aria-label="Day">
        {cols.map((d) => (
          <button key={d} type="button" className={`ts-day${view === 'day' && day === d ? ' on' : ''}${d === today ? ' today' : ''}`}
            onClick={() => { setDay(d); setView('day'); }}>
            <span className="ts-dname">{DAY[dow(d)]}</span>
            <span className="ts-ddate">{shortDate(d)}</span>
            <strong>{count(d)}</strong>
            <span className="ts-dsub">{verb}</span>
          </button>
        ))}
      </div>

      {view === 'day' && (
        <section className="ts-list" aria-label={`${DAY_LONG[dow(day)]}, ${shortDate(day)}`}>
          <h2>{DAY_LONG[dow(day)]}, {shortDate(day)}: {working.length} {verb}</h2>
          {byOffice.length === 0 && <p className="note">Nobody is scheduled.</p>}
          {byOffice.map((o) => (
            <div key={o.key} className="ts-office">
              <h3 className="rc-label">{o.name} · {o.list.length}</h3>
              <ul>
                {o.list.map(({ p, byDay }) => (
                  <li key={p.id} className={p.id === meId ? 'me' : ''}>
                    <Face person={p} size={34} />
                    <span className="ts-who"><strong>{p.first_name} {p.last_name}</strong><small>{roleTitle(p.department, p.level)}</small></span>
                    <span className="ts-hours">{byDay[day].text}{byDay[day].kind === 'part' && <small>part day off</small>}{byDay[day].requested && <small>{byDay[day].requested}</small>}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {notWorking.length > 0 && (
            <p className="note ts-off">Not {verb}: {notWorking.map(({ p, byDay }) => `${p.first_name} ${p.last_name}${byDay[day].kind === 'off' ? ' (time off)' : ''}`).join(', ')}</p>
          )}
        </section>
      )}

      {view === 'week' && (
        <div className="pay-scroll">
          <table className="ops-table ts-week">
            <thead>
              <tr><th scope="col">{DEPT_LABEL[dept] === 'Office' ? 'Office team' : DEPT_TITLE[dept]}</th>{cols.map((d) => <th key={d} scope="col" className={d === today ? 'today' : ''}>{DAY[dow(d)]} {shortDate(d)}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map(({ p, byDay }) => (
                <tr key={p.id} className={p.id === meId ? 'me' : ''}>
                  <th scope="row">{p.first_name} {p.last_name}<small>{OFFICE_NAME[p.office] || ''}</small></th>
                  {cols.map((d) => {
                    const x = byDay[d];
                    return <td key={d} className={`ts-${x.kind}`}>{x.text}{x.requested && <small>{x.requested}</small>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">{verb[0].toUpperCase() + verb.slice(1)}</th>{cols.map((d) => <td key={d}>{count(d)}</td>)}</tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="calc-hint ts-foot">Usual hours from each person’s schedule, minus approved time off. Requests not approved yet are noted.</p>
    </>
  );
}
