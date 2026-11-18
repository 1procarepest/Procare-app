import { KINDS, fmt, money2 } from '@/lib/bonus';
import { shortDate } from '@/lib/labels';
import { BugTile } from '../Bug';

const BUG = { tech_sales: 'ant', office_sales: 'ant', marketing_sales: 'stinging', reports: 'spider', autopay: 'cricket', ar_past: 'tick', cancel: 'roach', resv: 'centipede', resv_count: 'centipede', pool: 'termite', cost_per_customer: 'mosquito', logged: 'centipede', project: 'earwig' };

const pctText = (n) => `${Math.round(Number(n || 0))}%`;

/** One goal: where it stands, what it pays, where the current pace lands, and the next step. quarter = this person's quarter money. */
export default function GoalCard({ g, quarter, final = false, children }) {
  const k = KINDS[g.kind] || {};
  const dollars = (quarter * Number(g.weight || 0) * g.pay) / 10000;
  const worth = (quarter * Number(g.weight || 0)) / 100;
  const bar = Math.max(0, Math.min(100, g.progress ?? 0));
  const startText = g.start === null || g.start === undefined ? 'recorded on day 1' : fmt(g.kind, g.start);
  return (
    <li className={`bn-goal${g.pay >= 100 ? ' bn-hit' : ''}`}>
      <div className="bn-goal-head">
        <BugTile kind={BUG[g.kind] || 'ant'} tone={g.pay >= 100 ? 'lime' : 'sage'} size={38} />
        <span className="bn-goal-name">
          <b>{g.label}</b>
          <small>{k.label}{g.kind === 'project' && g.due_date ? ` · due ${shortDate(g.due_date)}` : ''} · {Number(g.weight)}% of the quarter{quarter > 0 ? ` (${money2(worth)})` : ''}</small>
        </span>
        <span className="bn-pay">{pctText(g.pay)}<small>paid</small></span>
      </div>
      <div className="bn-nums">
        <span><small>Now</small><b>{fmt(g.kind, g.actual)}</b></span>
        <span><small>Goal</small><b>{fmt(g.kind, g.target)}</b></span>
        {k.type === 'improve' && <span><small>Started at</small><b>{startText}</b></span>}
        {quarter > 0 && <span><small>{final ? 'Earned' : 'Earned so far'}</small><b>{money2(dollars)}</b></span>}
      </div>
      <div className="bn-bar" aria-hidden="true"><span style={{ width: `${bar}%` }} /></div>
      {!final && (
        <p className="calc-hint">
          {k.type === 'improve'
            ? `${pctText(g.progress)} of the way from ${startText} to ${fmt(g.kind, g.target)}.`
            : k.type === 'project' ? (g.actual ? 'Done.' : 'Not done yet. Log it with proof when it’s finished.')
              : k.type === 'cap' ? `${fmt(g.kind, g.actual)} so far; stay at or under ${fmt(g.kind, g.target)}.`
              : `${pctText(g.progress)} of the goal.`}
          {(k.type === 'count' || k.type === 'cap' || g.kind === 'cancel') && g.projected !== null && g.projected !== undefined
            ? ` At this pace: ${fmt(g.kind, g.projected)} by the end of the quarter, paying ${pctText(g.projectedPay)}.` : ''}
          {g.next ? ` ${g.next}.` : ''}
        </p>
      )}
      {children}
    </li>
  );
}
