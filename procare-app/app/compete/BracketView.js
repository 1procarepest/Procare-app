'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import Face from '../Face';
import Bug, { BugTile } from '../Bug';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import { DEFAULT_POINTS, fmt, kindsFor, prizeLine, scorePeople, usesTiers } from '@/lib/competitions';
import { buildBracket, lockedEntrants, makeEntrants, roundName } from '@/lib/bracket';

function Side({ e, score, win, lose, meId, decided }) {
  if (!e) return <div className="bk-side bk-empty">{decided ? 'Bye' : 'To be decided'}</div>;
  const mine = e.members.some((m) => m.id === meId);
  return (
    <div className={`bk-side${win ? ' bk-win' : ''}${lose ? ' bk-lose' : ''}${mine ? ' bk-mine' : ''}`}>
      <span className="bk-seed">{e.seed}</span>
      <span className="bk-name">{e.members.length === 1 ? <Face person={e.members[0]} size={22} /> : null}{e.name}</span>
      <span className="bk-score">{score === null ? '' : fmt(score)}</span>
    </div>
  );
}

export default function BracketView({ comp, board, today, meId, editable }) {
  const pts = { ...DEFAULT_POINTS, ...(comp.points || {}) };
  const seeding = useMemo(() => scorePeople(board, comp.points, comp.departments, comp.start_date, comp.seed_end), [board, comp]);
  const entrants = useMemo(
    () => (comp.locked_at ? lockedEntrants(board.members || [], comp.team_size) : makeEntrants(seeding, comp.team_size)),
    [board, comp, seeding],
  );
  const bracket = useMemo(() => buildBracket(comp, board, entrants, today), [comp, board, entrants, today]);
  const inSeeding = today <= comp.seed_end;
  const current = bracket.rounds.find((r) => r.started && !r.over);
  const teams = comp.team_size > 1;
  const tiers = usesTiers(comp.departments) ? (pts.tiers || []).filter((t) => Number(t.pts) > 0) : [];
  const kinds = kindsFor(comp.departments).filter((k) => Number(pts[k.key]) > 0);
  const anySeedPoints = seeding.some((p) => p.points > 0);
  const myEntrant = entrants.find((e) => e.members.some((m) => m.id === meId));

  let label = 'Seeding leader';
  let headline = anySeedPoints ? `${seeding[0].first_name} ${seeding[0].last_name}` : today < comp.start_date ? 'Not started yet' : 'No points yet';
  let sub = anySeedPoints ? `${fmt(seeding[0].points)} seeding points` : '';
  if (bracket.champion) { label = 'Champion'; headline = bracket.champion.name; sub = teams ? bracket.champion.members.map((m) => m.first_name).join(', ') : ''; }
  else if (!inSeeding) {
    const r = current || bracket.rounds.find((x) => !x.over);
    label = r ? `${roundName(r.index, bracket.rounds.length)} · ${shortDate(r.start)} – ${shortDate(r.end)}` : 'Bracket';
    headline = r?.started ? 'Round in progress' : 'Bracket set';
    sub = r?.started ? '' : `Starts ${shortDate(r?.start)}`;
  }

  return (
    <>
      <div className="rc-top brand-head">
        <Bug kind="roach" size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker"><Link href="/compete">Competitions</Link> · Bracket{teams ? ` · teams of ${comp.team_size}` : ''}</p>
          <h1 className="rc-title">{comp.name}</h1>
          <p className="rc-updated">
            Seeding {shortDate(comp.start_date)} – {shortDate(comp.seed_end)} · {comp.round_days}-day rounds · Final ends {shortDate(comp.end_date)}
            {board.through && !bracket.champion && ` · Points through ${shortDate(board.through)}`}
          </p>
        </div>
        {editable && <Link className="btn btn-quiet btn-small" href={`/compete/${comp.id}/edit`}>Edit</Link>}
      </div>

      <div className="cp-hero">
        <div className="cp-hero-main">
          {prizeLine(comp) && <p className="cp-hero-prize">💵 {prizeLine(comp)}</p>}
          {comp.prize && <p className="cp-hero-prize">🏆 {comp.prize}</p>}
          <p className="cp-hero-label">{label}</p>
          <p className="cp-hero-name">{headline}</p>
          {sub && <p className="cp-hero-sub">{sub}</p>}
        </div>
        <ul className="cp-rules" aria-label="How points are earned">
          {kinds.map((k) => (
            <li key={k.key}><b>{pts[k.key]}</b> {k.key === 'review' ? `${pts.review_stars === 5 ? '5-star' : `${pts.review_stars}+ star`} review` : k.label.toLowerCase()}</li>
          ))}
          {tiers.map((t, i) => <li key={`t${i}`}><b>+{t.pts}</b> pest contract over ${t.over}</li>)}
        </ul>
        <Bug kind="stinging" size={88} className="cp-hero-bug" />
      </div>

      {myEntrant && <p className="cp-me">You’re seed <b>#{myEntrant.seed}</b>{teams ? <> on <b>{myEntrant.name}</b></> : null}{!comp.locked_at && ' (for now; seeding decides it)'}</p>}

      <section className="rc-block">
        <div className="rc-block-head">
          <h2><BugTile kind="stinging" tone="ink" size={28} /> Bracket</h2>
          <span className="rc-label">
            {comp.locked_at ? 'Locked after seeding' : 'Projected from seeding so far'} · higher score in the round moves on, a tie goes to the higher seed{teams ? ' · team score = average per person' : ''}
          </span>
        </div>
        {bracket.rounds.length === 0 ? <p className="note">A bracket needs at least two {teams ? 'teams' : 'people'}.</p> : (
          <div className="bk-wrap">
            <div className="bk">
              {bracket.rounds.map((r) => (
                <div key={r.index} className="bk-round">
                  <p className="bk-round-head">
                    <b>{roundName(r.index, bracket.rounds.length)}</b>
                    <span>{shortDate(r.start)} – {shortDate(r.end)}{r.started && !r.over ? ' · live' : ''}</span>
                  </p>
                  <div className="bk-matches">
                    {r.matches.map((m, i) => (
                      <div key={i} className={`bk-match${m.live ? ' bk-live' : ''}`}>
                        <Side e={m.a} score={m.bye ? null : m.sa} win={m.winner && m.winner === m.a && !m.bye} lose={m.winner && m.winner !== m.a} meId={meId} decided={r.index === 0} />
                        <Side e={m.b} score={m.bye ? null : m.sb} win={m.winner && m.winner === m.b && !m.bye} lose={m.winner && m.winner !== m.b} meId={meId} decided={r.index === 0} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="bk-round bk-champ">
                <p className="bk-round-head"><b>Champion</b></p>
                <div className="bk-matches"><div className="bk-match">
                  {bracket.champion ? <div className="bk-side bk-win"><span className="bk-name">🏆 {bracket.champion.name}</span></div> : <div className="bk-side bk-empty">To be decided</div>}
                </div></div>
              </div>
            </div>
          </div>
        )}
      </section>

      {teams && (
        <section className="rc-block">
          <div className="rc-block-head"><h2><BugTile kind="spider" tone="forest" size={28} /> Teams</h2><span className="rc-label">{comp.locked_at ? 'Made from seeding' : 'Projected from seeding so far'}</span></div>
          <div className="cp-groups">
            {entrants.map((e) => (
              <div key={e.key} className={`cp-group${e.members.some((m) => m.id === meId) ? ' cp-mine' : ''}`}>
                <div className="cp-group-head" style={{ cursor: 'default' }}>
                  <span className="cp-place">#{e.seed}</span>
                  <span className="cp-group-name">{e.name}</span>
                </div>
                <ol className="cp-group-list">
                  {e.members.map((m) => <li key={m.id}><Face person={m} size={26} /> <span>{m.first_name} {m.last_name}</span></li>)}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rc-block">
        <div className="rc-block-head"><h2><BugTile kind="ant" tone="lime" size={28} /> Seeding standings</h2><span className="rc-label">{shortDate(comp.start_date)} – {shortDate(comp.seed_end)}</span></div>
        <div className="board-wrap">
          <table className="board cp-board">
            <thead>
              <tr>
                <th>#</th><th>Name</th><th>Office</th>
                {kinds.map((k) => <th key={k.key} className="num">{k.short}</th>)}
                {tiers.length > 0 && <th className="num">Contract bonus</th>}
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {seeding.map((p) => (
                <tr key={p.id} className={p.id === meId ? 'current' : ''}>
                  <td className="cp-place">{p.rank}</td>
                  <td><span className="cp-who"><Face person={p} size={30} /> {p.first_name} {p.last_name}{!p.active && <small> (left)</small>}</span></td>
                  <td>{OFFICE_NAME[p.office] || ''}</td>
                  {kinds.map((k) => <td key={k.key} className="num">{fmt(p[k.key] || 0)}</td>)}
                  {tiers.length > 0 && <td className="num">{fmt(p.bonus)}</td>}
                  <td className="num"><b>{fmt(p.points)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="calc-hint cp-foot">Bracket rounds count only the points earned during that round. Points update with each FieldRoutes sync.</p>
      </section>
    </>
  );
}
