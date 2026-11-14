import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import { PERIODS, calcPay, money, money0, num, rates } from '@/lib/scorecard';

export const dynamic = 'force-dynamic';

const fmtPct = (v) => (v === null || v === undefined ? '–' : `${v.toFixed(1)}%`);
const range = (a, b) => (String(a).slice(0, 10) === String(b).slice(0, 10) ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);

/** Up/down arrow vs the earlier stretch. lowerIsBetter flips the colors. */
function Trend({ cur, prior, lowerIsBetter, fmt }) {
  if (cur === null || cur === undefined || prior === null || prior === undefined) return null;
  const diff = cur - prior;
  if (Math.abs(diff) < 0.05) return <span className="trend">even with {fmt(prior)}</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return <span className={`trend ${good ? 'good' : 'bad'}`}>{diff > 0 ? '▲' : '▼'} from {fmt(prior)}</span>;
}

function Metric({ label, value, sub, children }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {sub && <span className="metric-sub">{sub}</span>}
      {children}
    </div>
  );
}

export default async function ScorecardPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const period = PERIODS.find((p) => p.key === searchParams?.period) || PERIODS[2];

  const [{ data: rows, error }, { data: perRows }, { data: ruleRow }] = await Promise.all([
    supabase.rpc('tech_scorecard', { p_period: period.key }),
    supabase.rpc('scorecard_period', { p_period: period.key }),
    supabase.from('scorecard_rules').select('rules').eq('id', 1).maybeSingle(),
  ]);
  if (error) {
    return <p className="error">The scorecard couldn’t load: {error.message}</p>;
  }
  const per = (perRows || [])[0] || {};
  const R = ruleRow?.rules || {};
  const scale = num(per.scale);

  // One entry per tech: { info, cur, prior }
  const techs = {};
  (rows || []).forEach((r) => {
    const t = techs[r.employee_id] || (techs[r.employee_id] = { id: r.employee_id, name: `${r.first_name} ${r.last_name}`.replace(/\s+/g, ' ').trim(), office: r.office, full: r.full_detail });
    t[r.which] = r;
  });
  const list = Object.values(techs).filter((t) => t.cur);
  const board = list
    .filter((t) => num(t.cur.sched) > 0)
    .sort((a, b) => num(b.cur.prod) - num(a.cur.prod) || num(b.cur.serv) - num(a.cur.serv));
  board.forEach((t, i) => { t.rank = i + 1; });

  const want = searchParams?.tech;
  const shown = (want && list.find((t) => t.id === want && t.full)) || list.find((t) => t.id === me.id) || null;
  const href = (p, tech) => `/scorecard?period=${p}${tech ? `&tech=${tech}` : ''}`;

  return (
    <>
      <div className="admin-head">
        <h1>Technician scorecard</h1>
        <p className="note">
          {period.label}: {range(per.cur_start, per.cur_end)}{per.in_progress ? ' (so far)' : ''}. Arrows compare with {period.prior} ({range(per.prior_start, per.prior_end)}).
        </p>
      </div>

      <nav className="tabs tabs-inline" aria-label="Period">
        {PERIODS.map((p) => (
          <Link key={p.key} href={href(p.key, shown && shown.id !== me.id ? shown.id : '')} className={`tab${p.key === period.key ? ' active' : ''}`} aria-current={p.key === period.key ? 'page' : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>

      {shown ? <Card t={shown} R={R} scale={scale} rank={shown.rank} total={board.length} isMe={shown.id === me.id} inProgress={per.in_progress} /> : (
        <p className="note spaced">Pick someone on the leaderboard to see their card.</p>
      )}

      <section className="spaced" aria-labelledby="board-heading">
        <h2 id="board-heading">Leaderboard</h2>
        <p className="note">Ranked by production. Names you can open have full detail.</p>
        <div className="board-wrap">
          <table className="board">
            <thead>
              <tr><th>#</th><th>Technician</th><th>Office</th><th className="num">Completion</th><th className="num">Production</th><th className="num">5-star</th></tr>
            </thead>
            <tbody>
              {board.map((t) => (
                <tr key={t.id} className={t.id === shown?.id ? 'current' : ''}>
                  <td className="num">{t.rank}</td>
                  <td>{t.full ? <Link href={href(period.key, t.id === me.id ? '' : t.id)}>{t.name}</Link> : t.name}</td>
                  <td>{OFFICE_NAME[t.office] || '–'}</td>
                  <td className="num">{fmtPct(rates(t.cur).comp)}</td>
                  <td className="num">{money0(t.cur.prod)}</td>
                  <td className="num">{t.cur.stars}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!board.length && <p className="note">No completed work in this period yet.</p>}
      </section>
    </>
  );
}

function Card({ t, R, scale, rank, total, isMe, inProgress }) {
  const c = t.cur, p = t.prior || {};
  const rc = rates(c), rp = rates(p);
  const pay = t.full && R.bonuses_on ? calcPay(c, R, scale) : null;
  const usd = (v) => money0(v);
  const drivingOn = t.full && c.drive_score !== null && c.drive_score !== undefined;

  return (
    <section className="card" aria-labelledby="card-heading">
      <div className="card-head">
        <div>
          <h2 id="card-heading">{isMe ? 'Your card' : t.name}</h2>
          <p className="note">{OFFICE_NAME[t.office] || 'No office'}{rank ? ` · #${rank} of ${total} in production` : ''}</p>
        </div>
      </div>

      <div className="metrics">
        <Metric label="Completion" value={fmtPct(rc.comp)} sub={`${c.serv} of ${c.sched} jobs`}>
          <Trend cur={rc.comp} prior={rp.comp} fmt={fmtPct} />
        </Metric>
        <Metric label="Production" value={usd(c.prod)}>
          <Trend cur={num(c.prod)} prior={p.prod === undefined ? null : num(p.prod)} fmt={usd} />
        </Metric>
        <Metric label="5-star reviews" value={c.stars} sub={c.reviews ? `${c.reviews} review${c.reviews === 1 ? '' : 's'}, ${c.rating} avg` : 'No reviews yet'}>
          <Trend cur={c.stars} prior={p.stars} fmt={(v) => v} />
        </Metric>
        {t.full && (
          <>
            <Metric label="Reservice rate" value={fmtPct(rc.resv)} sub={`${c.reservices} reservice${c.reservices === 1 ? '' : 's'}, ${c.incompletes} incomplete · ${c.partials} weather (not counted)`}>
              <Trend cur={rc.resv} prior={rp.resv} lowerIsBetter fmt={fmtPct} />
            </Metric>
            <Metric label="Cancels you caused" value={c.cx_tech} sub={`${c.cx_billing} billing cancels (not counted)`}>
              <Trend cur={c.cx_tech} prior={p.cx_tech} lowerIsBetter fmt={(v) => v} />
            </Metric>
            <Metric label="Sales serviced" value={c.sales_done} sub={`${c.sold} sold this period`}>
              <Trend cur={c.sales_done} prior={p.sales_done} fmt={(v) => v} />
            </Metric>
            <Metric
              label="Driving score"
              value={drivingOn ? c.drive_score : '–'}
              sub={drivingOn
                ? `${num(c.drive_miles).toLocaleString()} mi · ${c.distracted} distracted · ${c.drive_source === 'driver' ? 'your Samsara driver' : 'your truck'}`
                : 'No driving in Samsara for this period'}
            >
              <Trend cur={drivingOn ? c.drive_score : null} prior={p.drive_score} fmt={(v) => v} />
            </Metric>
          </>
        )}
      </div>

      {t.full && (
        <div className="panel bonus">
          <h3>Bonus</h3>
          {!pay ? (
            <p className="note">Bonus amounts haven’t been set yet. Your numbers still count, and this is where your bonus will show once they are.</p>
          ) : (
            <>
              {!pay.qualified && <p className="note">Bonuses start at {pay.minServed} completed jobs this period ({c.serv} so far). Sales still pay.</p>}
              {pay.gated && <p className="error">Your driving score is under {R.drive_gate}, so bonuses are on hold for this period.</p>}
              <table className="bonus-lines">
                <tbody>
                  <tr><td>Completion {fmtPct(rc.comp)}</td><td className="num">{money(pay.completion)}</td></tr>
                  <tr><td>Production over {money0(pay.floor)} ({R.prod_pct}%)</td><td className="num">{money(pay.production)}</td></tr>
                  <tr><td>{c.stars} five-star reviews × {money0(R.star_amt)}</td><td className="num">{money(pay.stars)}</td></tr>
                  {(num(R.drive_hi_amt) > 0 || num(R.drive_lo_amt) > 0) && (
                    <tr><td>Driving{pay.distractedCap ? ` (over ${pay.distractedMax} distracted events)` : ''}</td><td className="num">{money(pay.driving)}</td></tr>
                  )}
                  <tr><td>{c.sales_done} sales serviced × {money0(R.sale_amt)}</td><td className="num">{money(pay.sales)}</td></tr>
                  {pay.cancelPenalty > 0 && <tr><td>{c.cx_tech} cancels you caused</td><td className="num">−{money(pay.cancelPenalty)}</td></tr>}
                  {pay.gated && <tr><td>On hold (driving score)</td><td className="num">−{money(pay.held)}</td></tr>}
                  <tr className="total"><td>Total{inProgress ? ' so far' : ''}</td><td className="num">{money(pay.total)}</td></tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </section>
  );
}

