'use client';

import { useMemo, useState } from 'react';
import { GROUPS, GROUP_LABEL, PLAN_LABEL, money0, n, perDayFor, planOf, project } from '@/lib/comp';

const MIX_COLOR = { pest: 'var(--forest)', termite: 'var(--ink)', mosquito: 'var(--green)' };

function Num({ label, value, onChange, step = 1, min = 0, max, prefix, suffix, hint }) {
  return (
    <label className="calc-field">
      <span className="rc-label">{label}</span>
      <span className="calc-input">
        {prefix && <span className="calc-affix">{prefix}</span>}
        <input type="number" inputMode="decimal" value={value} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="calc-affix">{suffix}</span>}
      </span>
      {hint && <span className="calc-hint">{hint}</span>}
    </label>
  );
}

function Slider({ label, value, onChange, min, max, step, show }) {
  return (
    <label className="calc-field">
      <span className="calc-slider-head"><span className="rc-label">{label}</span><strong>{show(value)}</strong></span>
      <input className="calc-slider" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export default function Calculator({ data, year, rep }) {
  const s = data.settings;
  const mine = planOf(data, rep, year);
  const mySales = (data.sales || []).filter((x) => x.e === rep && x.served.startsWith(String(year)));
  const myPest = mySales.filter((x) => x.g === 'pest');
  const avgCv = myPest.length ? Math.round(myPest.reduce((t, x) => t + n(x.cv), 0) / myPest.length) : 470;
  const myMix = mySales.length >= 10
    ? Object.fromEntries(GROUPS.map((g) => [g, Math.round((100 * mySales.filter((x) => x.g === g).length) / mySales.length)]))
    : { pest: 70, termite: 20, mosquito: 10 };

  const [plan, setPlan] = useState(mine?.plan || 'commission');
  const [scale, setScale] = useState(mine?.scale || 'first_year');
  const [daysWk, setDaysWk] = useState(5);
  const [weeks, setWeeks] = useState(40);
  const [perDay, setPerDay] = useState(2);
  const [mix, setMix] = useState(myMix);
  const [pestCv, setPestCv] = useState(avgCv);
  const [cancelPct, setCancelPct] = useState(10);
  const [goal, setGoal] = useState('');

  // The rep's own deal (up front, start rate, step) applies when the plan and scale match theirs
  const a = useMemo(() => (mine && mine.plan === plan && (plan === 'flat' || mine.scale === scale) ? mine : { plan, scale }), [mine, plan, scale]);
  const days = n(daysWk) * n(weeks);
  const inputs = { days, perDay: n(perDay), mix, pestCv: n(pestCv), cancelPct: n(cancelPct) };
  const p = project(s, a, inputs);
  const other = project(s, { plan: plan === 'flat' ? 'commission' : 'flat', scale: 'first_year' }, inputs);
  const needed = goal ? perDayFor(s, a, inputs, n(goal)) : null;
  const tiers = [...(s.bonus || [])].sort((x, y) => n(x.min) - n(y.min));
  const nextTier = plan === 'commission' ? tiers.find((t) => n(pestCv) < n(t.min) && n(t.rate) > p.pestRate) : null;
  const boosted = nextTier ? project(s, a, { ...inputs, pestCv: n(nextTier.min) }) : null;

  // Keep the mix adding to 100: moving one slider takes the difference from the others, in proportion
  const setShare = (g, v) => {
    const [x, y] = GROUPS.filter((k) => k !== g);
    const left = 100 - v;
    const was = mix[x] + mix[y];
    const vx = was ? Math.round((mix[x] / was) * left) : Math.round(left / 2);
    setMix({ [g]: v, [x]: vx, [y]: left - vx });
  };

  const weeksWorked = Math.max(1, n(weeks));
  const scaleOpts = Object.entries(s.scales || {});

  return (
    <div className="calc">
      <section className="calc-in rc-panel">
        <div className="rc-panel-body calc-body">
          <h2 className="calc-h">Your plan</h2>
          <div className="calc-row">
            <div className="rc-seg" role="group" aria-label="Plan">
              {['commission', 'flat'].map((k) => <button key={k} type="button" className={plan === k ? 'on' : ''} onClick={() => setPlan(k)}>{k === 'commission' ? 'Commission' : 'Flat rate'}</button>)}
            </div>
            {plan === 'commission' && (
              <div className="rc-seg" role="group" aria-label="Pay scale">
                {scaleOpts.map(([k, v]) => <button key={k} type="button" className={scale === k ? 'on' : ''} onClick={() => setScale(k)}>{v.name}</button>)}
              </div>
            )}
          </div>
          {mine && <p className="calc-hint">{mine.plan === plan && (plan === 'flat' || mine.scale === scale) ? `This is your ${year} plan.` : `Your ${year} plan is the ${PLAN_LABEL[mine.plan].toLowerCase()}. Plans change only on January 1.`}</p>}

          <h2 className="calc-h">How much you’ll work</h2>
          <div className="calc-days" role="group" aria-label="Days a week">
            <span className="rc-label">Days a week</span>
            <div className="calc-chips">
              {[3, 4, 5, 6].map((d) => <button key={d} type="button" className={n(daysWk) === d ? 'on' : ''} onClick={() => setDaysWk(d)}>{d}</button>)}
            </div>
          </div>
          <Slider label="Weeks this year" value={n(weeks)} onChange={setWeeks} min={1} max={52} step={1} show={(v) => `${v} weeks · ${days} days`} />
          <Slider label="Serviced sales a day" value={n(perDay)} onChange={setPerDay} min={0} max={8} step={0.25} show={(v) => `${v} a day · ${Math.round(v * n(daysWk) * 10) / 10} a week`} />

          <h2 className="calc-h">What you sell</h2>
          <div className="calc-mixbar" aria-hidden="true">
            {GROUPS.map((g) => <span key={g} style={{ width: `${mix[g]}%`, background: MIX_COLOR[g] }} />)}
          </div>
          {GROUPS.map((g) => <Slider key={g} label={GROUP_LABEL[g]} value={mix[g]} onChange={(v) => setShare(g, v)} min={0} max={100} step={5} show={(v) => `${v}%`} />)}
          <Num label="Average pest contract value" value={pestCv} onChange={setPestCv} prefix="$" step={10}
            hint={`Yearly billing plus the initial. ${myPest.length ? `Yours this year: $${avgCv}.` : ''}`} />
          {plan === 'commission' && (
            <div className="calc-chips calc-cv">
              {[420, 470, ...tiers.map((t) => n(t.min))].map((v) => (
                <button key={v} type="button" className={n(pestCv) === v ? 'on' : ''} onClick={() => setPestCv(v)}>
                  ${v.toLocaleString()}{tiers.find((t) => n(t.min) === v) ? ` · ${tiers.find((t) => n(t.min) === v).rate}%` : ''}
                </button>
              ))}
            </div>
          )}
          <Slider label="Sales that cancel or don’t pay" value={n(cancelPct)} onChange={setCancelPct} min={0} max={40} step={1} show={(v) => `${v}%`} />
        </div>
      </section>

      <section className="calc-out">
        <div className="calc-hero">
          <span className="rc-label">Your year</span>
          <span className="calc-big">{money0(p.year)}</span>
          <span className="calc-hero-sub">{money0(p.year / 12)} a month · {money0(p.year / weeksWorked)} a week worked · {money0(days ? p.year / days : 0)} a day</span>
          <div className="calc-hero-grid">
            <div><span className="rc-label">Sales</span><strong>{p.total}</strong><small>{GROUPS.map((g) => `${p.count[g]} ${GROUP_LABEL[g].toLowerCase()}`).join(' · ')}</small></div>
            <div><span className="rc-label">Per sale</span><strong>{money0(p.perSale)}</strong><small>after cancels</small></div>
            {plan === 'commission'
              ? <div><span className="rc-label">Pest rate</span><strong>{p.pestRate}%</strong><small>{p.bonus > p.rate ? 'bonus rate' : `${p.scale.name} after ${p.good} good sales`}</small></div>
              : <div><span className="rc-label">Up front</span><strong>all of it</strong><small>no holdback or clawbacks</small></div>}
          </div>
        </div>

        {plan === 'commission' && (
          <div className="calc-card">
            <h3>How it’s paid</h3>
            <ul className="calc-paid">
              <li><span>Every Monday, {money0(n(a.upfront ?? s.upfront))} per sale serviced the week before</span><strong>≈ {money0(p.upfront / weeksWorked)} a week</strong></li>
              <li><span>The rest in quarter checks on Apr 20, Jul 20, Oct 20, with {n(s.hold_pct)}% held until Jan 20</span><strong>{money0(Math.max(0, p.backend))} a year</strong></li>
            </ul>
          </div>
        )}

        {plan === 'commission' && (
          <div className="calc-card">
            <h3>Your rate climbs every {p.scale.every} sales</h3>
            <p className="calc-hint">Every serviced sale counts toward the next step. The rate goes back to all of the year’s pest sales, and starts over each January.</p>
            <ol className="calc-ladder">
              {p.ladder.map((l) => (
                <li key={l.at} className={l.reached ? 'on' : ''}>
                  <span className="calc-rung">{l.rate}%</span>
                  <small>{l.at === 0 ? 'start' : `${l.at} sales`}</small>
                </li>
              ))}
            </ol>
          </div>
        )}

        {boosted && (
          <div className="calc-card calc-tip">
            <h3>Sell pest at {money0(nextTier.min)} or more</h3>
            <p>Those sales pay {nextTier.rate}% instead of {p.pestRate}%. At the same pace that’s <strong>{money0(boosted.year)}</strong> a year, <strong>{money0(boosted.year - p.year)} more</strong>.</p>
          </div>
        )}

        <div className="calc-card">
          <h3>Set a goal</h3>
          <Num label="I want to make this year" value={goal} onChange={setGoal} prefix="$" step={1000} />
          {goal && (needed === null
            ? <p className="calc-hint">That’s more than 20 sales a day with these numbers. Try more weeks or a bigger contract value.</p>
            : <p className="calc-goal">That takes about <strong>{Math.round(needed * 100) / 100} serviced sales a day</strong>, or {Math.round(needed * n(daysWk) * 10) / 10} a week, {Math.round(needed * days)} in all.</p>)}
        </div>

        <p className="calc-hint">
          On the {plan === 'flat' ? 'commission plan (First year)' : 'flat rate plan'}, the same year would pay {money0(other.year)}.
          These are estimates from your inputs, not a promise of pay.
        </p>
      </section>
    </div>
  );
}
