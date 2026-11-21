import { shortDate } from '@/lib/labels';
import { QUESTIONS, REVIEW_KIND, SCALE, VALUES, average } from '@/lib/reviews';

/** One saved review, read-only (also used on the employee's own page): G.R.E.E.N. ratings, a 6-month check-in or a yearly review. */
export default function ReviewCard({ r, children }) {
  const kind = REVIEW_KIND[r.kind] ? r.kind : 'green';
  const avg = kind === 'green' ? average(r.ratings) : null;
  const questions = QUESTIONS[kind] || [];
  return (
    <article className="rv-card">
      <header>
        <h3>{kind === 'green' ? `${r.year} review` : `${r.year} ${REVIEW_KIND[kind].label}`}</h3>
        <span className="note">{shortDate(r.review_date)}{avg ? ` · average ${avg} of 5` : ''}</span>
        {children}
      </header>
      {kind === 'green' && (
        <ul className="rv-ratings">
          {VALUES.map((v) => r.ratings?.[v.key] ? <li key={v.key}><span className="rv-letter">{v.letter}</span> {v.name}: <b>{r.ratings[v.key]}</b> <span className="note">{SCALE[r.ratings[v.key]]}</span></li> : null)}
        </ul>
      )}
      {questions.map((x) => r.answers?.[x.key] ? (
        <div key={x.key} className="rv-text"><b>{x.q}</b><p>{r.answers[x.key]}</p></div>
      ) : null)}
      {[['strengths', 'Strengths'], ['growth', 'Areas to grow'], ['goals', 'Goals for next year'], ['notes', 'Overall comments']].map(([k, label]) => r[k] ? (
        <div key={k} className="rv-text"><b>{label}</b><p>{r[k]}</p></div>
      ) : null)}
    </article>
  );
}
