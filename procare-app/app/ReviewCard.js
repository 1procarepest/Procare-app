import { shortDate } from '@/lib/labels';
import { SCALE, VALUES, average } from '@/lib/reviews';

/** One saved review, read-only (also used on the employee's own page). */
export default function ReviewCard({ r, children }) {
  const avg = average(r.ratings);
  return (
    <article className="rv-card">
      <header>
        <h3>{r.year} review</h3>
        <span className="note">{shortDate(r.review_date)}{avg ? ` · average ${avg} of 5` : ''}</span>
        {children}
      </header>
      <ul className="rv-ratings">
        {VALUES.map((v) => r.ratings?.[v.key] ? <li key={v.key}><span className="rv-letter">{v.letter}</span> {v.name}: <b>{r.ratings[v.key]}</b> <span className="note">{SCALE[r.ratings[v.key]]}</span></li> : null)}
      </ul>
      {[['strengths', 'Strengths'], ['growth', 'Areas to grow'], ['goals', 'Goals for next year'], ['notes', 'Overall comments']].map(([k, label]) => r[k] ? (
        <div key={k} className="rv-text"><b>{label}</b><p>{r[k]}</p></div>
      ) : null)}
    </article>
  );
}
