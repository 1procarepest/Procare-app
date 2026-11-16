'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Face from '../Face';
import Bug, { BugTile } from '../Bug';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import { COMPETE_AS, DEFAULT_POINTS, daysBetween, fmt, kindsFor, prizeLine, scoreGroups, scorePeople, serviceDeadline, stageOf, usesTiers } from '@/lib/competitions';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
const OFFICE_BUG = { east: 'ant', south: 'stinging', west: 'mosquito' };
const TEAM_BUGS = ['roach', 'spider', 'termite', 'cricket', 'tick', 'centipede', 'earwig'];
const TONES = ['ink', 'forest', 'lime', 'sage'];

function Counts({ row, kinds }) {
  return kinds.map((k) => <td key={k.key} className="num">{fmt(row[k.key] || 0)}</td>);
}

export default function Standings({ comp, board, today, meId, editable }) {
  const pts = { ...DEFAULT_POINTS, ...(comp.points || {}) };
  const stage = stageOf(comp, today);
  const people = useMemo(() => scorePeople(board, pts, comp.departments), [board, comp.points, comp.departments]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => (comp.compete_as === 'people' ? [] : scoreGroups(people, comp.compete_as)), [people, comp.compete_as]);
  const tiers = usesTiers(comp.departments) ? (pts.tiers || []).filter((t) => Number(t.pts) > 0) : [];
  const kinds = [
    ...kindsFor(comp.departments).filter((k) => Number(pts[k.key]) > 0),
    ...(tiers.length ? [{ key: 'bonus', label: 'Contract bonus', short: 'Contract bonus' }] : []),
  ];
  const deadline = serviceDeadline(pts, comp.end_date);   // null when sales don't need to be serviced
  const waiting = deadline && today > comp.end_date && today <= deadline;
  const showPending = !!deadline && people.some((p) => p.pending > 0);
  const [open, setOpen] = useState(null);
  const me = people.find((p) => p.id === meId);
  const myGroup = me && groups.find((g) => g.members.some((m) => m.id === meId));
  const totalDays = daysBetween(comp.start_date, comp.end_date);
  const dayNo = stage === 'live' ? daysBetween(comp.start_date, today) : null;
  const leader = comp.compete_as === 'people' ? people[0] : groups[0];
  const anyPoints = people.some((p) => p.points > 0);

  return (
    <>
      <div className="rc-top brand-head">
        <Bug kind="spider" size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker"><Link href="/compete">Competitions</Link> · {COMPETE_AS[comp.compete_as]}</p>
          <h1 className="rc-title">{comp.name}</h1>
          <p className="rc-updated">
            {shortDate(comp.start_date)} – {shortDate(comp.end_date)}
            {stage === 'live' && ` · Day ${dayNo} of ${totalDays}`}
            {stage === 'upcoming' && ' · Starts soon'}
            {stage === 'final' && (waiting ? ` · Waiting for services until ${shortDate(deadline)}, then final` : ' · Final')}
            {board.through && (stage !== 'final' || waiting) && ` · Points through ${shortDate(board.through)}`}
            {deadline && !waiting && stage !== 'final' && ` · Sales must be serviced by ${shortDate(deadline)}`}
          </p>
        </div>
        {editable && <Link className="btn btn-quiet btn-small" href={`/compete/${comp.id}/edit`}>Edit</Link>}
      </div>

      <div className="cp-hero">
        <div className="cp-hero-main">
          {prizeLine(comp) && <p className="cp-hero-prize">💵 {prizeLine(comp)}</p>}
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
          {kinds.filter((k) => k.key !== 'bonus').map((k) => (
            <li key={k.key}><b>{pts[k.key]}</b> {k.key === 'review' ? `${pts.review_stars === 5 ? '5-star' : `${pts.review_stars}+ star`} review` : k.label.toLowerCase()}</li>
          ))}
          {tiers.map((t, i) => <li key={`t${i}`}><b>+{t.pts}</b> pest contract over ${t.over}</li>)}
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
          <div className="rc-block-head"><h2><BugTile kind="termite" tone="ink" size={28} /> {comp.compete_as === 'offices' ? 'Offices' : 'Teams'}</h2><span className="rc-label">Ranked by average points per person</span></div>
          <div className="cp-groups">
            {groups.map((g) => (
              <div key={g.key} className={`cp-group${g.rank === 1 && anyPoints ? ' cp-first' : ''}${myGroup?.key === g.key ? ' cp-mine' : ''}`}>
                <button type="button" className="cp-group-head" onClick={() => setOpen(open === g.key ? null : g.key)} aria-expanded={open === g.key}>
                  <span className="cp-place">{(anyPoints && MEDAL[g.rank]) || `#${g.rank}`}</span>
                  <span className="cp-group-name"><BugTile kind={comp.compete_as === 'offices' ? OFFICE_BUG[g.key] || 'ant' : TEAM_BUGS[groups.indexOf(g) % TEAM_BUGS.length]} tone={TONES[groups.indexOf(g) % TONES.length]} size={26} /> {g.name}</span>
                  <span className="cp-group-avg">{fmt(g.avg)}<small> per person</small></span>
                  <span className="cp-group-sub">{fmt(g.points)} points · {g.members.length} {g.members.length === 1 ? 'person' : 'people'}</span>
                  <span className="cp-group-sub">{kinds.map((k) => `${fmt(g[k.key])} ${k.short.toLowerCase()}`).join(' · ')}</span>
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

      {comp.compete_as === 'people' && anyPoints && (
        <div className="cp-podium" aria-label="Top three">
          {people.filter((p) => p.points > 0).slice(0, 3).map((p, i) => (
            <div key={p.id} className={`cp-pod cp-pod-${i + 1}${p.id === meId ? ' cp-mine' : ''}`}>
              <Bug kind={['stinging', 'spider', 'ant'][i]} size={90} className="cp-pod-bug" />
              <span className="cp-pod-medal">{MEDAL[p.rank] || `#${p.rank}`}</span>
              <Face person={p} size={i === 0 ? 64 : 52} />
              <span className="cp-pod-name">{p.first_name} {p.last_name}</span>
              <span className="cp-pod-pts">{fmt(p.points)}<small> pts</small></span>
              <span className="cp-pod-sub">{OFFICE_NAME[p.office] || ''}</span>
            </div>
          ))}
        </div>
      )}

      <section className="rc-block">
        <div className="rc-block-head"><h2><BugTile kind="roach" tone="forest" size={28} /> {comp.compete_as === 'people' ? 'Standings' : 'Everyone'}</h2></div>
        <div className="board-wrap">
          <table className="board cp-board">
            <thead>
              <tr>
                <th>#</th><th>Name</th>
                {comp.compete_as === 'teams' ? <th>Team</th> : <th>Office</th>}
                {kinds.map((k) => <th key={k.key} className="num">{k.short}</th>)}
                {showPending && <th className="num" title="Sold, but not serviced yet: no points until it is">Pending service</th>}
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
                  {showPending && <td className="num cp-pending">{p.pending || ''}</td>}
                  <td className="num"><b>{fmt(p.points)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="calc-hint cp-foot">
          Sales count only when sold between {shortDate(comp.start_date)} and {shortDate(comp.end_date)}, credited to whoever sold it
          {deadline ? `, and only once the first service is done by ${shortDate(deadline)} (until then they’re pending; after that they drop off)` : ''}.
          Auto-pay counts for the tech who serviced the customer that day, and for the rep when a sale is on auto-pay. Reviews count for the tech on the reviewed visit.
          {tiers.length > 0 && ' Contract bonus: points for pest-control sales over each contract value tier.'} Points update with each FieldRoutes sync.
        </p>
      </section>
    </>
  );
}
