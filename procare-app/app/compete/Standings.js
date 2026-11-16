'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Face from '../Face';
import Bug from '../Bug';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import { COMPETE_AS, DEFAULT_POINTS, KINDS, daysBetween, fmt, scoreGroups, scorePeople, stageOf } from '@/lib/competitions';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

function Counts({ row, kinds }) {
  return kinds.map((k) => <td key={k.key} className="num">{row[k.key] || 0}</td>);
}

export default function Standings({ comp, board, today, meId, editable }) {
  const pts = { ...DEFAULT_POINTS, ...(comp.points || {}) };
  const stage = stageOf(comp, today);
  const people = useMemo(() => scorePeople(board, pts), [board, comp.points]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => (comp.compete_as === 'people' ? [] : scoreGroups(people, comp.compete_as)), [people, comp.compete_as]);
  const kinds = KINDS.filter((k) => Number(pts[k.key]) > 0);
  const [open, setOpen] = useState(null);
  const me = people.find((p) => p.id === meId);
  const myGroup = me && groups.find((g) => g.members.some((m) => m.id === meId));
  const totalDays = daysBetween(comp.start_date, comp.end_date);
  const dayNo = stage === 'live' ? daysBetween(comp.start_date, today) : null;
  const leader = comp.compete_as === 'people' ? people[0] : groups[0];
  const anyPoints = people.some((p) => p.points > 0);

  return (
    <>
      <div className="rc-top">
        <div>
          <p className="rc-kicker"><Link href="/compete">Competitions</Link> · {COMPETE_AS[comp.compete_as]}</p>
          <h1 className="rc-title">{comp.name}</h1>
          <p className="rc-updated">
            {shortDate(comp.start_date)} – {shortDate(comp.end_date)}
            {stage === 'live' && ` · Day ${dayNo} of ${totalDays}`}
            {stage === 'upcoming' && ' · Starts soon'}
            {stage === 'final' && ' · Final'}
            {board.through && stage !== 'final' && ` · Points through ${shortDate(board.through)}`}
          </p>
        </div>
        {editable && <Link className="btn btn-quiet btn-small" href={`/compete/${comp.id}/edit`}>Edit</Link>}
      </div>

      <div className="cp-hero">
        <div className="cp-hero-main">
          {comp.prize && <p className="cp-hero-prize">🏆 {comp.prize}</p>}
          <p className="cp-hero-label">{stage === 'final' ? 'Winner' : 'In the lead'}</p>
          <p className="cp-hero-name">
            {!anyPoints ? (stage === 'upcoming' ? 'Not started yet' : 'No points yet')
              : comp.compete_as === 'people' ? `${leader.first_name} ${leader.last_name}` : leader.name}
          </p>
          {anyPoints && (
            <p className="cp-hero-sub">
              {comp.compete_as === 'people' ? `${fmt(leader.points)} points` : `${fmt(leader.avg)} points per person`}
            </p>
          )}
        </div>
        <ul className="cp-rules" aria-label="How points are earned">
          {kinds.map((k) => (
            <li key={k.key}><b>{pts[k.key]}</b> {k.key === 'review' ? `${pts.review_stars === 5 ? '5-star' : `${pts.review_stars}+ star`} review` : k.label.toLowerCase()}</li>
          ))}
        </ul>
        <Bug kind="ant" size={88} className="cp-hero-bug" />
      </div>

      {me && (
        <p className="cp-me">
          You’re <b>#{me.rank}</b> with <b>{fmt(me.points)}</b> points
          {myGroup && <> · {myGroup.name} is <b>#{myGroup.rank}</b> ({fmt(myGroup.avg)} per person)</>}
        </p>
      )}

      {groups.length > 0 && (
        <section className="rc-block">
          <div className="rc-block-head"><h2>{comp.compete_as === 'offices' ? 'Offices' : 'Teams'}</h2><span className="rc-label">Ranked by average points per person</span></div>
          <div className="cp-groups">
            {groups.map((g) => (
              <div key={g.key} className={`cp-group${g.rank === 1 && anyPoints ? ' cp-first' : ''}${myGroup?.key === g.key ? ' cp-mine' : ''}`}>
                <button type="button" className="cp-group-head" onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={open === g.key}>
                  <span className="cp-place">{(anyPoints && MEDAL[g.rank]) || `#${g.rank}`}</span>
                  <span className="cp-group-name">{g.name}</span>
                  <span className="cp-group-avg">{fmt(g.avg)}<small> per person</small></span>
                  <span className="cp-group-sub">{fmt(g.points)} points · {g.members.length} {g.members.length === 1 ? 'person' : 'people'}</span>
                  <span className="cp-group-sub">{kinds.map((k) => `${g[k.key]} ${k.short.toLowerCase()}`).join(' · ')}</span>
                  <span className={`rc-caret${open === g.key ? ' open' : ''}`} aria-hidden="true">⌄</span>
                </button>
                {open === g.key && (
                  <ol className="cp-group-list">
                    {g.members.map((m) => (
                      <li key={m.id} className={m.id === meId ? 'cp-mine' : ''}>
                        <Face person={m} size={26} /> <span>{m.first_name} {m.last_name}</span> <b>{fmt(m.points)}</b>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rc-block">
        <div className="rc-block-head"><h2>{comp.compete_as === 'people' ? 'Standings' : 'Everyone'}</h2></div>
        <div className="board-wrap">
          <table className="board cp-board">
            <thead>
              <tr>
                <th>#</th><th>Name</th>
                {comp.compete_as === 'teams' ? <th>Team</th> : <th>Office</th>}
                {kinds.map((k) => <th key={k.key} className="num">{k.short}</th>)}
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className={p.id === meId ? 'current' : ''}>
                  <td className="cp-place">{(anyPoints && p.points > 0 && MEDAL[p.rank]) || p.rank}</td>
                  <td><span className="cp-who"><Face person={p} size={30} /> {p.first_name} {p.last_name}{!p.active && <small> (left)</small>}</span></td>
                  <td>{comp.compete_as === 'teams' ? p.team : OFFICE_NAME[p.office] || ''}</td>
                  <Counts row={p} kinds={kinds} />
                  <td className="num"><b>{fmt(p.points)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="calc-hint cp-foot">
          Sales count when the first service is completed, credited to the rep who sold it. Auto-pay counts for the tech who serviced the customer that day.
          Reviews count for the tech on the reviewed visit. Points update with each FieldRoutes sync.
        </p>
      </section>
    </>
  );
}
