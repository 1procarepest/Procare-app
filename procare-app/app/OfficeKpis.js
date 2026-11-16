import Link from 'next/link';
import Bug from './Bug';
import { OFFICE_NAME } from '@/lib/labels';
import { int, num, pct1 } from '@/lib/ops';

/** ▲ 12% / ▼ 4% vs last month so far. goodWhenDown flips the color. */
function Delta({ cur, prior, goodWhenDown = false }) {
  if (!num(prior)) return <span className="hk-delta">no compare yet</span>;
  const ch = (num(cur) - num(prior)) / num(prior);
  if (Math.abs(ch) < 0.0005) return <span className="hk-delta">same as last month</span>;
  const good = goodWhenDown ? ch < 0 : ch > 0;
  return <span className={`hk-delta ${good ? 'good' : 'bad'}`}>{ch > 0 ? '▲' : '▼'} {Math.abs(ch * 100).toFixed(0)}% vs last month</span>;
}

/**
 * Office staff's home page: their office's key numbers this month, from the same data as the
 * Operations card (ops_suite for the month so far, ops_snapshot for right now).
 * `stats` and `snap` come from buildOps / buildSnapshot; `office` is a key or 'total'.
 */
export default function OfficeKpis({ office, stats, snap, monthName }) {
  const s = stats[office]?.cur;
  const p = stats[office]?.prior;
  const n = snap[office];
  if (!s || !n) return null;
  const name = office === 'total' ? 'All offices' : OFFICE_NAME[office];
  const cancelRate = n.accounts ? s.cxl / n.accounts : null;
  const apRate = n.accounts ? n.ap_valid / n.accounts : null;
  const pastAr = n.d30 + n.d60 + n.d90;
  const arRate = n.ar ? pastAr / n.ar : null;
  const left = (b) => n.pool[b].left_core + n.pool[b].left_other;
  const tiles = [
    { label: 'New sales', val: int(s.services), sub: <Delta cur={s.services} prior={p.services} />, bug: 'spider', tone: 'ink' },
    { label: 'Cancellations', val: int(s.cxl), sub: <><span className="hk-sub">{pct1(cancelRate)} of customers</span><Delta cur={s.cxl} prior={p.cxl} goodWhenDown /></>, bug: 'roach', tone: 'forest' },
    { label: 'On auto-pay', val: pct1(apRate), sub: <span className="hk-sub">{int(n.ap_valid)} of {int(n.accounts)} customers</span>, bug: 'ant', tone: 'lime' },
    { label: 'AR past due 30+', val: pct1(arRate), sub: <span className="hk-sub">of all accounts receivable</span>, bug: 'tick', tone: 'sage' },
    { label: `Job pool left · ${monthName}`, val: int(left('this')), sub: <span className="hk-sub">{int(n.pool.this.scheduled)} already on the schedule</span>, bug: 'termite', tone: 'ink' },
    { label: 'Job pool past due', val: int(left('past')), sub: <span className="hk-sub">not on the schedule yet</span>, bug: 'cricket', tone: 'forest' },
  ];
  return (
    <section className="section hk" aria-labelledby="hk-heading">
      <div className="my-card-head">
        <h2 id="hk-heading">{name} this month</h2>
        <Link href="/ops?view=month">Operations card ›</Link>
      </div>
      <div className="ops-tiles hk-tiles">
        {tiles.map((t) => (
          <div key={t.label} className={`ops-tile ops-tile-${t.tone}`}>
            <Bug kind={t.bug} size={84} className="ops-tile-bug" />
            <span className="ops-tile-label">{t.label}</span>
            <span className="ops-tile-val">{t.val}</span>
            {t.sub}
          </div>
        ))}
      </div>
    </section>
  );
}
