'use client';

import { useEffect, useRef, useState } from 'react';
import Toggle from '../../Toggle';
import { BugTile } from '../../Bug';
import { money0, n } from '@/lib/comp';

/**
 * "Invest part of it": what putting a share of the year's pay away each month could grow to.
 * Starts from the goal the rep typed in "Set a goal", or else the calculator's projected year.
 * Monthly deposits at the end of each month, compounded monthly. An illustration, not advice.
 */

const RATES = [
  { key: 'r4', rate: 4, color: '#8A9C93', hint: 'Cautious' },
  { key: 'r7', rate: 7, color: 'var(--forest)', hint: 'Middle of the road' },
  { key: 'r10', rate: 10, color: 'var(--green)', hint: 'Strong years' },
  { key: 'r12', rate: 12, color: '#A9B01E', hint: 'Very strong years' },
];
const OWN_COLOR = 'var(--ink)';
const CONTRIB_COLOR = '#8B9A9C';
const YEARS = [5, 10, 20, 30];

/** Balance at the end of each year (index 0 = now). */
export function growth(monthly, annualPct, years) {
  const r = annualPct / 100 / 12;
  const out = [0];
  let bal = 0;
  for (let m = 1; m <= years * 12; m++) {
    bal = bal * (1 + r) + monthly;
    if (m % 12 === 0) out.push(bal);
  }
  return out;
}

const short = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);
function niceMax(v) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => f <= k) * p;
}

function Chart({ lines, contrib, years }) {
  const box = useRef(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const h = w < 480 ? 220 : 260;
  const m = { l: 48, r: 56, t: 10, b: 24 };
  const top = niceMax(Math.max(...contrib, ...lines.flatMap((l) => l.s)));
  const x = (i) => m.l + ((w - m.l - m.r) * i) / years;
  const y = (v) => m.t + (h - m.t - m.b) * (1 - v / top);
  const path = (s) => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  // Gridlines at round numbers: 1.5 → 3 steps of 0.5, 2.5 → 5 of 0.5, 3 → 3 of 1, and so on
  const lead = Math.round((top / 10 ** Math.floor(Math.log10(top))) * 10) / 10;
  const count = { 1: 4, 1.5: 3, 2: 4, 2.5: 5, 3: 3, 4: 4, 5: 5, 6: 3, 8: 4, 10: 5 }[lead] || 4;
  const ticks = Array.from({ length: count + 1 }, (_, i) => (top * i) / count);
  const step = w < 480 ? (years <= 5 ? 1 : years <= 10 ? 5 : 10) : (years <= 5 ? 1 : years <= 10 ? 2 : 5);
  // End labels, nudged apart so they don't overlap
  const labels = [...lines.map((l) => ({ v: l.s[years], c: l.color })), { v: contrib[years], c: 'var(--muted)' }]
    .map((l) => ({ ...l, py: y(l.v) })).sort((a, b) => a.py - b.py);
  for (let i = 1; i < labels.length; i++) if (labels[i].py - labels[i - 1].py < 14) labels[i].py = labels[i - 1].py + 14;
  const over = labels.length ? labels[labels.length - 1].py - (h - m.b) : 0;
  if (over > 0) labels.forEach((l) => { l.py -= over; });
  return (
    <div ref={box} className="ivst-chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Projected value by year for each return">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" fill="none" />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{short(t)}</text>
          </g>
        ))}
        {Array.from({ length: Math.floor(years / step) + 1 }, (_, k) => k * step).map((i) => (
          <text key={i} x={x(i)} y={h - 6} textAnchor="middle">{i === 0 ? 'Now' : `Yr ${i}`}</text>
        ))}
        <path d={path(contrib)} fill="none" stroke={CONTRIB_COLOR} strokeWidth="2" strokeDasharray="5 4" />
        {lines.map((l) => <path key={l.key} d={path(l.s)} fill="none" stroke={l.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
        {lines.map((l) => <circle key={l.key} cx={x(years)} cy={y(l.s[years])} r="4" fill={l.color} stroke="var(--white)" strokeWidth="2" />)}
        {labels.map((l, i) => <text key={i} className="ivst-end" x={w - m.r + 6} y={l.py + 4} style={{ fill: l.c }}>{short(l.v)}</text>)}
      </svg>
    </div>
  );
}

export default function Invest({ goal, projected }) {
  const hasGoal = n(goal) > 0;
  const [source, setSource] = useState(hasGoal ? 'goal' : 'projected');
  const [own, setOwn] = useState('');
  const [pct, setPct] = useState(10);
  const [on, setOn] = useState({ r4: true, r7: true, r10: true, r12: false, own: false });
  const [ownRate, setOwnRate] = useState('8');
  const [years, setYears] = useState(30);
  const [showTable, setShowTable] = useState(false);

  // If the goal is cleared, fall back to the projection
  const src = source === 'goal' && !hasGoal ? 'projected' : source;
  const income = src === 'goal' ? n(goal) : src === 'own' ? n(own) : Math.max(0, Math.round(n(projected)));
  const perYear = (income * pct) / 100;
  const monthly = perYear / 12;
  const contrib = Array.from({ length: years + 1 }, (_, i) => perYear * i);
  const put = perYear * years;

  const lines = [
    ...RATES.filter((r) => on[r.key]).map((r) => ({ ...r, label: `${r.rate}%` })),
    ...(on.own ? [{ key: 'own', rate: Math.max(-10, Math.min(30, n(ownRate))), color: OWN_COLOR, hint: 'Your own' }] : []),
  ].map((l) => ({ ...l, label: `${Math.round(l.rate * 100) / 100}%`, s: growth(monthly, l.rate, years) }))
    .sort((a, b) => a.rate - b.rate);

  return (
    <div className="calc-card ivst">
      <h3 className="cp-h"><BugTile kind="ant" tone="lime" size={26} /> Invest part of it</h3>
      <p className="calc-hint">See what putting a share of your pay away every month could grow to over time.</p>

      <div className="ivst-row">
        <div className="calc-field">
          <span className="rc-label">Start from</span>
          <div className="rc-seg" role="group" aria-label="Yearly pay to start from">
            {hasGoal && <button type="button" className={src === 'goal' ? 'on' : ''} onClick={() => setSource('goal')}>My goal</button>}
            <button type="button" className={src === 'projected' ? 'on' : ''} onClick={() => setSource('projected')}>My projected year</button>
            <button type="button" className={src === 'own' ? 'on' : ''} onClick={() => { setSource('own'); if (!own) setOwn(String(income || '')); }}>Type it</button>
          </div>
        </div>
        {src === 'own'
          ? (
            <label className="calc-field">
              <span className="rc-label">Yearly pay</span>
              <span className="calc-input"><span className="calc-affix">$</span>
                <input type="number" inputMode="numeric" min={0} step={1000} value={own} onChange={(e) => setOwn(e.target.value)} /></span>
            </label>
          )
          : <div className="calc-field"><span className="rc-label">Yearly pay</span><strong className="ivst-income">{money0(income)}</strong></div>}
      </div>

      <label className="calc-field">
        <span className="calc-slider-head"><span className="rc-label">Share you invest</span><strong>{pct}%</strong></span>
        <input className="calc-slider" type="range" min={0} max={30} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
      </label>
      <div className="ivst-per">
        <div><span className="rc-label">Per month</span><strong>{money0(monthly)}</strong></div>
        <div><span className="rc-label">Per year</span><strong>{money0(perYear)}</strong></div>
        <div><span className="rc-label">Put in over {years} yrs</span><strong>{money0(put)}</strong></div>
      </div>

      <div className="ivst-row ivst-opts">
        <div className="calc-field">
          <span className="rc-label">Yearly return to show</span>
          <div className="ivst-toggles">
            {RATES.map((r) => (
              <Toggle key={r.key} small checked={on[r.key]} onChange={(v) => setOn({ ...on, [r.key]: v })}>
                <span className="ivst-dot" style={{ background: r.color }} /><strong>{r.rate}%</strong> <span className="calc-hint">{r.hint}</span>
              </Toggle>
            ))}
            <Toggle small checked={on.own} onChange={(v) => setOn({ ...on, own: v })} label="Your own yearly return">
              <span className="ivst-dot" style={{ background: OWN_COLOR }} /><span>Your own</span>
            </Toggle>
            {on.own && (
              <span className="calc-input ivst-own"><input type="number" inputMode="decimal" step={0.5} value={ownRate} aria-label="Your own yearly return, percent" onChange={(e) => setOwnRate(e.target.value)} /><span className="calc-affix">%</span></span>
            )}
          </div>
        </div>
        <div className="calc-field">
          <span className="rc-label">How many years</span>
          <div className="rc-seg" role="group" aria-label="How many years">
            {YEARS.map((y) => <button key={y} type="button" className={years === y ? 'on' : ''} onClick={() => setYears(y)}>{y}</button>)}
          </div>
        </div>
      </div>

      {perYear > 0 && lines.length > 0 ? (
        <>
          <div className="ivst-results">
            {lines.map((l) => (
              <div key={l.key} className="ivst-result" style={{ '--c': l.color }}>
                <span className="rc-label">At {l.label} a year</span>
                <strong>{money0(l.s[years])}</strong>
                <small>{money0(put)} put in · <b>{l.s[years] - put >= 0 ? '+' : ''}{money0(l.s[years] - put)}</b> from compounding</small>
              </div>
            ))}
          </div>
          <Chart lines={lines} contrib={contrib} years={years} />
          <div className="ivst-legend">
            {lines.map((l) => <span key={l.key}><i style={{ background: l.color }} />{l.label}</span>)}
            <span><i className="ivst-dash" />You put in</span>
          </div>
          <Toggle small checked={showTable} onChange={setShowTable}>Show year by year</Toggle>
          {showTable && (
            <div className="ivst-table">
              <table>
                <thead><tr><th>Year</th><th>You put in</th>{lines.map((l) => <th key={l.key}>At {l.label}</th>)}</tr></thead>
                <tbody>
                  {contrib.slice(1).map((c, i) => (
                    <tr key={i} className={[5, 10, 20, 30].includes(i + 1) ? 'mile' : ''}>
                      <td>Year {i + 1}</td><td>{money0(c)}</td>{lines.map((l) => <td key={l.key}>{money0(l.s[i + 1])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className="calc-hint">{perYear > 0 ? 'Turn on at least one yearly return to see growth.' : 'Move the slider above 0% and set your yearly pay to see growth.'}</p>
      )}

      <p className="calc-hint">
        Figured with equal deposits at the end of each month, compounded monthly (the yearly rate ÷ 12). Growth from compounding is the projected value minus what you put in.
        It leaves out raises, taxes, fees and inflation. <strong>This is an illustration, not financial advice.</strong> Actual returns vary from year to year and can be negative; no rate here is promised.
      </p>
    </div>
  );
}
