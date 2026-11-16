'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  GROUP_LABEL, PLAN_LABEL, customers, money, money0, nextMonday, nice, rateAt, statement,
} from '@/lib/comp';
import Calculator from './Calculator';
import PlanSettings from './PlanSettings';

const qs = (o) => '?' + Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

function Panel({ title, summary, children, open: startOpen = false }) {
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

const planLine = (st) => {
  if (!st.plan) return 'No plan set';
  if (st.plan.plan === 'flat') return PLAN_LABEL.flat;
  return `${PLAN_LABEL.commission} · ${st.scale.name}`;
};

/** Where a commission rep stands: rate now and how far to the next step. */
function rateNow(st) {
  if (st.plan?.plan !== 'commission') return null;
  const q = st.quarters[st.quarters.length - 1];
  const count = q ? q.count : 0;
  const rate = rateAt(st.scale, count);
  const nextAt = rate >= st.scale.max ? null : (Math.floor(count / st.scale.every) + 1) * st.scale.every;
  return { count, rate, nextAt, nextRate: nextAt ? rateAt(st.scale, nextAt) : null };
}

function Lines({ rows, cols }) {
  if (!rows.length) return null;
  return (
    <table className="ops-table pay-lines">
      <thead><tr>{cols.map((c) => <th key={c.k} scope="col">{c.h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.id}>{cols.map((c, i) => (i ? <td key={c.k}>{c.v(r)}</td> : <th key={c.k} scope="row">{c.v(r)}</th>))}</tr>)}
      </tbody>
    </table>
  );
}

const custCol = { k: 'c', h: 'Customer', v: (r) => [r.f, r.c].filter(Boolean).join(' ') || `#${r.cid || r.id}` };
const typeCol = { k: 'g', h: 'Service', v: (r) => GROUP_LABEL[r.g] };
const servedCol = { k: 's', h: 'Serviced', v: (r) => nice(r.served) };

/** "Jane Smith", or the last/business name, or the customer number if the customer hasn't synced yet. */
const custName = (r) => [r.f, r.c].filter(Boolean).join(' ') || (r.cid ? 'Name not synced yet' : `#${r.id}`);

const FILTERS = [
  { k: 'all', label: 'All', test: () => true },
  { k: 'left', label: 'Still to be paid', test: (r) => r.left > 0 },
  { k: 'paid', label: 'Paid in full', test: (r) => r.status === 'Paid in full' },
  { k: 'cancel', label: 'Canceled', test: (r) => r.tone === 'bad' || r.svc?.key === 'canceled' },
  { k: 'open', label: 'Not serviced yet', test: (r) => r.kind === 'open' && r.svc?.key !== 'canceled' },
];

/** Every customer the rep added: status, what it earns, what's been paid, what's left, deductions. */
function CustomerList({ st, open, today }) {
  const [f, setF] = useState('all');
  const { rows, totals } = useMemo(() => customers(st, open, today), [st, open, today]);
  const shown = rows.filter(FILTERS.find((x) => x.k === f).test);
  return (
    <Panel open title="Your customers" summary={`${rows.length} · ${money0(totals.paid)} paid · ${money0(totals.left)} to go`}>
      <div className="calc-chips pay-filter" role="group" aria-label="Show">
        {FILTERS.map((x) => {
          const k = rows.filter(x.test).length;
          return <button key={x.k} type="button" className={f === x.k ? 'on' : ''} onClick={() => setF(x.k)}>{x.label} {k}</button>;
        })}
      </div>
      <div className="pay-scroll">
        <table className="ops-table pay-cust">
          <thead>
            <tr><th scope="col">Customer</th><th scope="col">Service</th><th scope="col">Contract value</th><th scope="col">Sold</th><th scope="col">Serviced</th><th scope="col">Status</th><th scope="col">Earns</th><th scope="col">Paid</th><th scope="col">Left to pay</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className={r.tone ? `pay-${r.tone}` : ''}>
                <th scope="row">{custName(r)}{r.cid && <small>Customer #{r.cid}</small>}</th>
                <td>{GROUP_LABEL[r.g]}</td>
                <td>{money0(r.cv)}</td>
                <td>{nice(r.sold)}</td>
                <td>{r.served ? nice(r.served) : r.svc ? r.svc.short : '—'}</td>
                <td><span className="pay-status-text">{r.status}</span>{r.note && <small>{r.note}</small>}</td>
                <td>{money(r.earned)}{r.g === 'pest' && r.rate ? <small>{r.rate}%{r.bonus ? ' bonus' : ''}</small> : null}</td>
                <td>{money(r.paid)}</td>
                <td>{r.deduction < 0 && <span className="pay-deduct">{money(r.deduction)} taken back</span>}{r.left < 0 ? <span className="pay-deduct">{money(r.left)} to take back</span> : r.deduction < 0 ? null : money(r.left)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} className="pay-muted">Nothing here.</td></tr>}
          </tbody>
          <tfoot>
            <tr><th scope="row" colSpan={6}>All {rows.length} customers</th><td>{money(totals.earned)}</td><td>{money(totals.paid)}</td><td>{money(totals.left)}{totals.deduction < 0 && <small className="pay-deduct">{money(totals.deduction)} taken back</small>}</td></tr>
            <tr><th scope="row" colSpan={7}>Paid so far, after what was taken back</th><td colSpan={2}>{money(totals.paid + totals.deduction)}</td></tr>
          </tfoot>
        </table>
      </div>
      <p className="calc-hint">“Earns” uses your rate today; if your rate goes up, older pest sales earn more too. Pest sales are paid {money0(st.settings.upfront)} up front, then the rest in quarter checks with {st.settings.hold_pct}% held until January 20.</p>
    </Panel>
  );
}

function Statement({ st, today, open }) {
  const now = rateNow(st);
  const next = nextMonday(today);
  const nextWeek = st.weeks.find((w) => w.payday === next);
  const openQ = st.quarters.find((q) => q.payDate > today);
  const held = st.quarters.length ? st.quarters[st.quarters.length - 1].held : 0;

  if (!st.plan) {
    return (
      <>
        <p className="note pay-noplan">No pay plan is set for {st.rep?.name || 'this rep'} in {st.year}. A sales manager or the President sets it on the Plans tab.</p>
        <CustomerList st={st} open={open} today={today} />
      </>
    );
  }
  const isFlat = st.plan.plan === 'flat';

  return (
    <>
      <div className="rc-tiles pay-tiles">
        <Tile label="Plan" value={isFlat ? 'Flat rate' : `${now.rate}%`} sub={isFlat ? 'paid in full up front' : `${st.scale.name} · ${now.count} sales this year${now.nextAt ? ` · ${now.nextRate}% at ${now.nextAt}` : ' · top rate'}`} />
        <Tile label={`Next Monday, ${nice(next)}`} value={money(nextWeek?.total || 0)} sub={`${nextWeek?.sales.length || 0} serviced last week`} />
        <Tile label="Up front this year" value={money0(st.upfrontYtd)} sub={`${st.weeks.filter((w) => w.paid).length} paydays`} />
        {!isFlat && <Tile label={openQ ? `Q${openQ.q} check, ${nice(openQ.payDate)}` : 'Quarter checks'} value={money(openQ ? openQ.paidOut : 0)} sub={openQ && !openQ.done ? 'so far this quarter' : 'estimate'} />}
        {!isFlat && <Tile label="Held back" value={money0(held)} sub={`paid with the Jan 20 check`} />}
      </div>

      <CustomerList st={st} open={open} today={today} />

      {!isFlat && st.quarters.slice().reverse().map((q) => (
        <Panel key={q.q} open={q === openQ}
          title={`Q${q.q} ${q.done ? '' : '(so far) '}· check ${nice(q.payDate)}`}
          summary={`${money(q.paidOut)}${q.check < 0 ? ` · ${money(-q.check)} owed back` : ''}`}>
          <table className="ops-table pay-math">
            <tbody>
              <tr><th scope="row">Good sales this year by {nice(q.asOf)}</th><td>{q.count} → {q.rate}% on pest</td></tr>
              <tr><th scope="row">Earned on good sales (pest at {q.rate}% or bonus rate, others at their up-front amount)</th><td>{money(q.owed)}</td></tr>
              {q.priorBack > 0 && <tr><th scope="row">Clawbacks on last year’s sales</th><td>−{money(q.priorBack)}</td></tr>}
              {st.carryIn < 0 && <tr><th scope="row">Owed back from last year</th><td>{money(st.carryIn)}</td></tr>}
              <tr><th scope="row">Up fronts paid this year</th><td>−{money(q.upfronts)}</td></tr>
              {q.checksBefore > 0 && <tr><th scope="row">Earlier quarter checks</th><td>−{money(q.checksBefore)}</td></tr>}
              {q.held > 0 && <tr><th scope="row">Held back until the Jan 20 check</th><td>−{money(q.held - (st.quarters[q.q - 2]?.held || 0))}</td></tr>}
              {q.forfeited && <tr><th scope="row">No longer with Procare: the held amount isn’t paid</th><td /></tr>}
              <tr className="pay-total"><th scope="row">Check</th><td>{money(q.paidOut)}</td></tr>
            </tbody>
          </table>
          {q.pest.length > 0 && <>
            <h3 className="pay-sub">Pest sales ({q.pest.length})</h3>
            <Lines rows={q.pest} cols={[custCol, servedCol,
              { k: 'cv', h: 'Contract value', v: (r) => money(r.cv) },
              { k: 'r', h: 'Rate', v: (r) => (r.bonus > q.rate ? `${r.rate}% bonus` : `${r.rate}%`) },
              { k: 'e', h: 'Earned', v: (r) => money(r.earned) }]} />
          </>}
          {q.cancels.length > 0 && <>
            <h3 className="pay-sub">Canceled in the first year: no pay, up front taken back ({q.cancels.length})</h3>
            <Lines rows={q.cancels} cols={[custCol, typeCol, servedCol, { k: 'x', h: 'Canceled', v: (r) => nice(r.can) }, { k: 'u', h: 'Up front', v: (r) => money(r.upfront) }]} />
          </>}
          {q.pending.length > 0 && <>
            <h3 className="pay-sub">More than {st.settings.past_due_days} days past due: counts once they pay ({q.pending.length})</h3>
            <Lines rows={q.pending} cols={[custCol, typeCol, servedCol, { k: 'b', h: 'Balance', v: (r) => money(r.bal) }, { k: 'a', h: 'Days past due', v: (r) => r.age }]} />
          </>}
        </Panel>
      ))}

      {st.priorClawbacks.length > 0 && (
        <Panel title="Last year’s sales canceled this year" summary={`−${money(st.priorClawbacks.reduce((t, x) => t + x.amount, 0))}`}>
          <Lines rows={st.priorClawbacks} cols={[custCol, typeCol, servedCol, { k: 'x', h: 'Canceled', v: (r) => nice(r.can) }, { k: 'a', h: 'Taken back', v: (r) => money(r.amount) }]} />
        </Panel>
      )}

      <Panel title="Weekly up fronts" summary={`${st.weeks.length} weeks · ${money0(st.weeks.reduce((t, w) => t + w.total, 0))}`} open={isFlat}>
        {st.weeks.length === 0 && <p className="note">No serviced sales yet this year.</p>}
        {st.weeks.map((w) => (
          <details key={w.payday} className="pay-week">
            <summary>
              <span>{w.paid ? 'Paid' : 'Pays'} Monday {nice(w.payday)}</span>
              <span className="pay-muted">serviced {nice(w.from)}–{nice(w.to)} · {w.sales.length}</span>
              <strong>{money(w.total)}</strong>
            </summary>
            <Lines rows={w.sales} cols={[custCol, typeCol, servedCol, { k: 'u', h: 'Up front', v: (r) => money(r.upfront) }]} />
          </details>
        ))}
      </Panel>
    </>
  );
}

function TeamTable({ data, year, today }) {
  const rows = data.reps.map((r) => {
    const st = statement(data, r.id, year, today);
    const q = st.quarters[st.quarters.length - 1];
    return { r, st, q };
  });
  return (
    <table className="ops-table pay-team">
      <thead>
        <tr><th scope="col">Rep</th><th scope="col">Plan</th><th scope="col">Serviced sales</th><th scope="col">Rate</th><th scope="col">Up front this year</th><th scope="col">Latest quarter check</th><th scope="col">Held</th></tr>
      </thead>
      <tbody>
        {rows.map(({ r, st, q }) => (
          <tr key={r.id} className={r.active ? '' : 'pay-muted'}>
            <th scope="row"><Link href={qs({ year, rep: r.id })}>{r.name}</Link>{!r.active && ' (left)'}</th>
            <td>{planLine(st)}</td>
            <td>{st.sales.length}</td>
            <td>{q ? `${q.rate}%` : '—'}</td>
            <td>{money0(st.upfrontYtd || 0)}</td>
            <td>{q ? `${money(q.paidOut)} · ${nice(q.payDate)}` : '—'}</td>
            <td>{q ? money0(q.held) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PayView({ data, year, thisYear, today, tab, rep, meId, nextPlans }) {
  const st = useMemo(() => (rep ? statement(data, rep, year, today) : null), [data, rep, year, today]);
  const who = data.reps.find((r) => r.id === rep);
  const openSales = useMemo(() => (data.open || []).filter((x) => x.e === rep), [data, rep]);
  const tabHref = (t) => qs({ tab: t === 'statement' ? null : t, year, rep: data.boss ? rep : null });

  return (
    <>
      <div className="rc-top">
        <div>
          <p className="rc-kicker">Sales pay · {year}</p>
          <h1 className="rc-title">{tab === 'calc' ? <>Pay <em>calculator</em></> : tab === 'plans' ? <>Pay <em>plans</em></> : who && rep !== meId ? <>{who.name.split(' ')[0]}’s <em>pay</em></> : rep ? <>Your <em>pay</em></> : <>Team <em>pay</em></>}</h1>
        </div>
        <nav className="rc-step" aria-label="Choose a year">
          {year > 2025 ? <Link className="rc-arrow" href={qs({ tab: tab === 'statement' ? null : tab, year: year - 1, rep: data.boss ? rep : null })} aria-label="Previous year">‹</Link> : <span className="rc-arrow off">‹</span>}
          <span className="rc-range">{year}</span>
          {year < thisYear + 1 ? <Link className="rc-arrow" href={qs({ tab: tab === 'statement' ? null : tab, year: year + 1, rep: data.boss ? rep : null })} aria-label="Next year">›</Link> : <span className="rc-arrow off">›</span>}
        </nav>
      </div>

      <div className="rc-controls">
        <nav className="rc-seg" aria-label="Pay sections">
          <Link className={tab === 'statement' ? 'on' : ''} href={tabHref('statement')}>Statement</Link>
          <Link className={tab === 'calc' ? 'on' : ''} href={tabHref('calc')}>Calculator</Link>
          {data.boss && <Link className={tab === 'plans' ? 'on' : ''} href={tabHref('plans')}>Plans</Link>}
        </nav>
        {data.boss && tab !== 'plans' && (
          <select className="rc-office-pick" aria-label="Rep" value={rep || ''} onChange={(e) => { window.location.href = (tab === 'calc' ? qs({ tab, year, rep: e.target.value }) : qs({ year, rep: e.target.value })); }}>
            <option value="">{tab === 'calc' ? 'Choose a rep' : 'Whole team'}</option>
            {data.reps.map((r) => <option key={r.id} value={r.id}>{r.name}{r.active ? '' : ' (left)'}</option>)}
          </select>
        )}
      </div>

      {tab === 'statement' && (
        <p className="pay-shadow">
          <strong>Shadow mode.</strong> These are the app’s numbers, to check against Stakt and the real checks. Nothing is paid from here.
          Up fronts are counted as paid on their Monday. Past-due and cancel status is as of today’s FieldRoutes sync.
        </p>
      )}

      {tab === 'statement' && (rep ? <Statement st={st} today={today} open={openSales} /> : <TeamTable data={data} year={year} today={today} />)}
      {tab === 'calc' && <Calculator data={data} year={year} rep={rep} />}
      {tab === 'plans' && <PlanSettings data={data} year={year} nextPlans={nextPlans} />}
    </>
  );
}
