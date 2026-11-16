import Link from 'next/link';
import Bug from './Bug';
import { shortDate } from '@/lib/labels';

const BUGS = ['stinging', 'spider', 'ant'];

/** Live competitions the person is in, on the profile. */
export default function MyCompetitions({ list }) {
  if (!list?.length) return null;
  return (
    <section className="section" aria-labelledby="mc-heading">
      <div className="my-card-head">
        <h2 id="mc-heading">Your competitions</h2>
        <Link href="/compete">All competitions ›</Link>
      </div>
      <div className="mc-list">
        {list.map(({ comp, prize, standing }, i) => (
          <Link key={comp.id} href={`/compete/${comp.id}`} className="mc-card">
            <Bug kind={BUGS[i % BUGS.length]} size={90} className="mc-bug" />
            <span className="cp-tag">Live · ends {shortDate(comp.end_date)}</span>
            <span className="mc-name">{comp.name}</span>
            {standing && <span className="mc-standing">{standing}</span>}
            {prize && <span className="mc-prize">💵 {prize}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
