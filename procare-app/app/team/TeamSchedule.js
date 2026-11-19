'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Face from '../Face';
import { DEPT_LABEL, OFFICES, OFFICE_NAME, roleTitle, shortDate, toMinutes } from '@/lib/labels';
import { dayFor } from '@/lib/teamSchedule';
import { isBWeek, usualShift } from '@/lib/schedules';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dow = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const DEPT_TITLE = { sales: 'Sales', technician: 'Technicians', administrative: 'Office' };

// Whole weeks from this week's Monday to the week holding ymd (for the month calendar's links)
function weeksFrom(today, ymd) {
  const monday = (x) => { const d = new Date(`${x}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; };
  return Math.round((monday(ymd) - monday(today)) / (7 * 86400000));
}
const shortName = (p) => `${p.first_name} ${p.last_name?.[0] || ''}`.trim();

export default function TeamSchedule({ data, days, today, week, weeksBack, weeksAhead, month, monthsBack, monthsAhead, pick, meId, myOffice, updates = [] }) {
  const isMonth = month !== undefined;
  const depts = data.depts || [];
  const [dept, setDept] = useState(depts.length === 1 ? depts[0] : depts.includes('technician') ? 'technician' : depts[0]);
  const [office, setOffice] = useState('all');
  const thisWeek = days.includes(today);
  const [picked, setDay] = useState(pick || (thisWeek ? today : days[0]));
  // The arrows load another week into this same page, so a day picked earlier may not be in it: fall back
  // to the tapped day, today, or that week's Monday (the old day left the lists empty and crashed the page).
  const day = days.includes(picked) ? picked : (days.includes(pick) ? pick : thisWeek ? today : days[0]);
  const [view, setView] = useState('day');

  // Everyone's week, worked out once
  const grid = useMemo(() => {
    const shifts = {};
    (data.schedules || []).forEach((s) => {
      if (s.s && s.x) (shifts[s.e] ||= {})[s.d] = [toMinutes(s.s), toMinutes(s.x)];
    });
    // Every-other-week hours (change 54): B-week hours for the days that differ, and each person's week A
    const alt = {};
    (data.alt || []).forEach((s) => { (alt[s.e] ||= {})[s.d] = s.s && s.x ? [toMinutes(s.s), toMinutes(s.x)] : null; });
    const rot = Object.fromEntries((data.rot || []).map((r) => [r.e, String(r.a).slice(0, 10)]));
    const off = {};
    (data.off || []).forEach((r) => (off[r.e] ||= []).push(r));
    return (data.people || []).map((p) => {
      const usual = (d) => usualShift(shifts[p.id], alt[p.id], rot[p.id], d, dow(d));
      return {
        p, usual, weekB: (d) => isBWeek(rot[p.id], d),
        byDay: Object.fromEntries(days.map((d) => [d, dayFor(usual(d), off[p.id] || [], d)])),
      };
    });
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
  const monthHref = (n) => (n ? `/team?span=month&month=${n}` : '/team?span=month');
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${days[0]}T12:00:00Z`));

  // Month calendar: Monday-first weeks, blanks before the 1st; Sunday only if someone works one
  const monthSunday = isMonth && days.some((d) => dow(d) === 0 && count(d) > 0);
  const calWeeks = [];
  if (isMonth) {
    let row = Array((dow(days[0]) + 6) % 7).fill(null);
    days.forEach((d) => {
      row.push(d);
      if (row.length === 7) { calWeeks.push(row); row = []; }
    });
    if (row.length) calWeeks.push([...row, ...Array(7 - row.length).fill(null)]);
  }
  // Only people who'd normally work that day (time off on a day they're already off isn't news)
  const offOn = (d) => shown.filter((r) => r.usual(d) && (['off', 'part'].includes(r.byDay[d].kind) || r.byDay[d].requested));

  return (
    <>
      <div className="rc-top">
        <div>
          <p className="rc-kicker">Team schedule</p>
          <h1 className="rc-title">Who’s <em>{verb}</em></h1>
        </div>
        {isMonth ? (
          <nav className="rc-step" aria-label="Choose a month">
            {month > -monthsBack ? <Link className="rc-arrow" href={monthHref(month - 1)} aria-label="Previous month" scroll={false}>‹</Link> : <span className="rc-arrow off">‹</span>}
            {month === 0 ? <span className="rc-range">This month</span> : <Link className="rc-range" href={monthHref(0)} scroll={false}>{monthLabel}</Link>}
            {month < monthsAhead ? <Link className="rc-arrow" href={monthHref(month + 1)} aria-label="Next month" scroll={false}>›</Link> : <span className="rc-arrow off">›</span>}
          </nav>
        ) : (
        <nav className="rc-step" aria-label="Choose a week">
          {week > -weeksBack ? <Link className="rc-arrow" href={href(week - 1)} aria-label="Previous week" scroll={false}>‹</Link> : <span className="rc-arrow off">‹</span>}
          {week === 0 ? <span className="rc-range">This week</span> : <Link className="rc-range" href="/team" scroll={false}>Week of {shortDate(days[0])}</Link>}
          {week < weeksAhead ? <Link className="rc-arrow" href={href(week + 1)} aria-label="Next week" scroll={false}>›</Link> : <span className="rc-arrow off">›</span>}
        </nav>
        )}
      </div>

      <div className="rc-controls">
        <div className="calc-row">
          {depts.length > 1 && (
            <div className="rc-seg" role="group" aria-label="Department">
              {depts.map((d) => <button key={d} type="button" className={dept === d ? 'on' : ''} onClick={() => setDept(d)}>{DEPT_TITLE[d]}</button>)}
            </div>
          )}
          {isMonth ? (
            <div className="rc-seg" role="group" aria-label="View">
              <Link href="/team" scroll={false}>By day</Link>
              <Link href="/team" scroll={false}>Week</Link>
              <Link className="on" href={monthHref(month)} scroll={false}>Month</Link>
            </div>
          ) : (
            <div className="rc-seg" role="group" aria-label="View">
              <button type="button" className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>By day</button>
              <button type="button" className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Week</button>
              <Link href={monthHref(0)} scroll={false}>Month</Link>
            </div>
          )}
        </div>
        <div className="chips ts-office-chips" role="group" aria-label="Office">
          {[{ key: 'all', name: 'All offices' }, ...OFFICES].map((o) => (
            <button key={o.key} type="button" className={`chip${office === o.key ? ' on' : ''}`} aria-pressed={office === o.key} onClick={() => setOffice(o.key)}>
              {o.name}{o.key === myOffice ? ' (yours)' : ''}
            </button>
          ))}
        </div>
      </div>

      {dept === 'sales' && updates.length > 0 && (
        <p className="ts-updates">
          <b>Availability updated:</b>{' '}
          {updates.map((u, i) => <span key={`${u.id}-${u.at}`}>{i ? ', ' : ''}{u.name} ({shortDate(String(u.at).slice(0, 10))})</span>)}
          {' '}· from their availability form, no approval needed.
        </p>
      )}

      {isMonth && (
        <section className="ts-month" aria-label={monthLabel}>
          {month === 0 && <h2>{monthLabel}</h2>}
          <div className={`ts-cal${monthSunday ? '' : ' no-sun'}`}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].slice(0, monthSunday ? 7 : 6).map((n) => <span key={n} className="ts-cal-head">{n}</span>)}
            {calWeeks.flatMap((wk) => wk.slice(0, monthSunday ? 7 : 6)).map((d, i) => {
              if (!d) return <span key={`b${i}`} className="ts-cal-blank" />;
              const w = weeksFrom(today, d);
              const offs = offOn(d);
              const inner = (
                <>
                  <span className="ts-cal-date">{Number(d.slice(8))}</span>
                  <span className="ts-cal-count"><strong>{count(d)}</strong> {verb}</span>
                  {offs.map(({ p, byDay }) => (
                    <span key={p.id} className={`ts-cal-off ts-cal-${byDay[d].kind === 'off' ? 'full' : byDay[d].kind === 'part' ? 'part' : 'ask'}`}
                      title={byDay[d].kind === 'off' ? 'Time off' : byDay[d].kind === 'part' ? 'Part day off' : byDay[d].requested}>
                      {shortName(p)}
                    </span>
                  ))}
                </>
              );
              const cls = `ts-cal-day${d === today ? ' today' : ''}${dow(d) === 0 ? ' sun' : ''}`;
              return w >= -weeksBack && w <= weeksAhead
                ? <Link key={d} className={cls} href={`/team?${w ? `week=${w}&` : ''}day=${d}`} aria-label={`${DAY_LONG[dow(d)]}, ${shortDate(d)}`}>{inner}</Link>
                : <div key={d} className={cls}>{inner}</div>;
            })}
          </div>
          <p className="ts-cal-key"><span className="ts-cal-off ts-cal-full">Time off</span><span className="ts-cal-off ts-cal-part">Part day off</span><span className="ts-cal-off ts-cal-ask">Asked, not approved yet</span></p>
        </section>
      )}

      {!isMonth && (
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
      )}

      {!isMonth && view === 'day' && (
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

      {!isMonth && view === 'week' && (
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
      <p className="calc-hint ts-foot">{isMonth ? 'Each day shows how many are scheduled, minus approved time off, and who is off. Tap a day to see everyone.' : 'Usual hours from each person’s schedule, minus approved time off. Requests not approved yet are noted.'}</p>
    </>
  );
}
