'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import Bug, { BugTile } from '../Bug';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import { daysBetween, fmt, prizeLine, stageOf } from '@/lib/competitions';
import { kfmt, scoreOffices } from '@/lib/officeKpis';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
const OFFICE_BUG = { east: 'ant', south: 'stinging', west: 'mosquito' };
const TONE = ['ink', 'forest', 'lime'];

export default function KpiView({ comp, board, members, today, meOffice, editable }) {
  const stage = stageOf(comp, today);
  const { offices, on, cfg } = useMemo(() => scoreOffices(board.offices || [], comp.points), [board, comp.points]);
  const any = offices.some((o) => o.total > 0);
  const leader = offices[0];
  const people = (key) => members.filter((m) => m.office === key);

  return (
    <>
      <div className="rc-top brand-head">
        <Bug kind="termite" size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker"><Link href="/compete">Competitions</Link> · Office KPIs</p>
          <h1 className="rc-title">{comp.name}</h1>
          <p className="rc-updated">
            {shortDate(comp.start_date)} – {shortDate(comp.end_date)}
            {stage === 'live' && ` · Day ${daysBetween(comp.start_date, today)} of ${daysBetween(comp.start_date, comp.end_date)}`}
            {stage === 'upcoming' && ' · Starts soon'}
            {stage === 'final' && ' · Final'}
            {board.end_day && ` · Office numbers as of ${shortDate(board.end_day)} morning`}
          </p>
        </div>
        {editable && <Link className="btn btn-quiet btn-small" href={`/compete/${comp.id}/edit`}>Edit</Link>}
      </div>

      <div className="cp-hero">
        <div className="cp-hero-main">
          {prizeLine(comp) && <p className="cp-hero-prize">💵 {prizeLine(comp)}</p>}
          {comp.prize && <p className="cp-hero-prize">🏆 {comp.prize}</p>}
          <p className="cp-hero-label">{stage === 'final' ? 'Winner' : 'In the lead'}</p>
          <p className="cp-hero-name">{any ? OFFICE_NAME[leader.office] : stage === 'upcoming' ? 'Not started yet' : 'No points yet'}</p>
          {any && <p className="cp-hero-sub">{fmt(leader.total)} points</p>}
        </div>
        <ul className="cp-rules" aria-label="What counts">
          {on.map((k) => {
            const c = cfg[k.key];
            return <li key={k.key}>{k.label}: <b>{c.mode === 'goal' ? `${k.better === 'high' ? '≥' : '<'} ${c.goal}${k.unit.startsWith('%') ? '%' : ''} = ${c.pts} pts` : `by place × ${c.pts}`}</b></li>;
          })}
        </ul>
        <Bug kind="termite" size={88} className="cp-hero-bug" />
      </div>

      <div className="kpi-offices">
        {offices.map((o, i) => (
          <div key={o.office} className={`kpi-office kpi-office-${TONE[i] || 'sage'}${o.office === meOffice ? ' cp-mine' : ''}`}>
            <Bug kind={OFFICE_BUG[o.office] || 'ant'} size={96} className="kpi-office-bug" />
            <span className="cp-pod-medal">{(any && MEDAL[o.rank]) || `#${o.rank}`}</span>
            <span className="kpi-office-name">{OFFICE_NAME[o.office] || o.office}</span>
            <span className="kpi-office-pts">{fmt(o.total)}<small> pts</small></span>
            <span className="cp-pod-sub">{people(o.office).length} on the team</span>
          </div>
        ))}
      </div>

      <section className="rc-block">
        <div className="rc-block-head"><h2><BugTile kind="spider" tone="forest" size={28} /> Scorecard</h2><span className="rc-label">Rates, so office size doesn’t matter</span></div>
        <div className="board-wrap">
          <table className="board kpi-table">
            <thead>
              <tr><th>KPI</th>{offices.map((o) => <th key={o.office} className="num">{OFFICE_NAME[o.office] || o.office}</th>)}</tr>
            </thead>
            <tbody>
              {on.map((k) => {
                const c = cfg[k.key];
                return (
                  <tr key={k.key}>
                    <th scope="row">
                      <span className="cp-who"><BugTile kind={k.bug} tone="sage" size={26} /> <span>{k.label}<small className="kpi-unit"> {k.unit}{c.mode === 'goal' ? ` · goal ${k.better === 'high' ? '≥' : '<'} ${c.goal}` : ''}</small></span></span>
                    </th>
                    {offices.map((o) => {
                      const x = o.kpis[k.key];
                      return (
                        <td key={o.office} className={`num${x.hit ? ' kpi-hit' : ''}${x.place === 1 && c.mode === 'place' ? ' kpi-first' : ''}`}>
                          <span className="kpi-val">{kfmt(x.v)}{k.unit.startsWith('%') && x.v !== null ? '%' : ''}</span>
                          <small className="kpi-pts">
                            {x.v === null ? 'no data' : c.mode === 'goal' ? (x.hit ? `✓ +${fmt(x.pts)}` : 'not yet') : `${MEDAL[x.place] || `#${x.place}`} +${fmt(x.pts)}`}
                          </small>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="kpi-total"><th scope="row">Total points</th>{offices.map((o) => <td key={o.office} className="num">{fmt(o.total)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <ul className="cp-hints cp-foot">
          {on.map((k) => <li key={k.key}><b>{k.label}:</b> {k.hint}</li>)}
          <li>Office numbers (customers, auto-pay, AR, job pool) are saved each morning; the scorecard uses the copy from the morning after the end date, or the latest one while it’s running.</li>
        </ul>
      </section>

      <section className="rc-block">
        <div className="rc-block-head"><h2><BugTile kind="cricket" tone="lime" size={28} /> Teams</h2></div>
        <div className="cp-groups">
          {offices.map((o) => (
            <div key={o.office} className="cp-group">
              <div className="cp-group-head" style={{ cursor: 'default' }}><span className="cp-group-name"><BugTile kind={OFFICE_BUG[o.office] || 'ant'} tone="ink" size={26} /> {OFFICE_NAME[o.office]}</span></div>
              <ol className="cp-group-list">{people(o.office).map((m) => <li key={m.id}>{m.first_name} {m.last_name}</li>)}</ol>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
