import Link from 'next/link';
import { windowLabel } from '@/lib/timeWindow';

function title(offset, day) {
  if (offset === 0) return 'Today’s route';
  if (offset === 1) return 'Tomorrow’s route';
  if (offset === -1) return 'Yesterday’s route';
  const d = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return `Route for ${d}`;
}

const UPSELL_NAME = { GPS: 'General pest', TBS: 'Termite bait system', MOS: 'Mosquito' };

/** A tech's jobs for one day (7 days back to 7 ahead): customer last name, auto-pay, notes and what to offer. */
export default function TodayRoute({ jobs, offset = 0, day, links }) {
  const noAutopay = jobs.filter((j) => !j.autopay).length;
  const when = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : offset === -1 ? 'yesterday' : 'that day';
  return (
    <section className="section" aria-labelledby="route-heading">
      <div className="week-head">
        <h2 id="route-heading">{title(offset, day)}</h2>
        <nav className="week-nav" aria-label="Choose a day">
          {links?.prev
            ? <Link className="week-arrow" href={links.prev} aria-label="Previous day" scroll={false}>‹</Link>
            : <span className="week-arrow" aria-hidden="true">‹</span>}
          {offset === 0
            ? <span className="week-label">Today</span>
            : <Link className="week-label" href={links?.today || '/'} scroll={false}>Back to today</Link>}
          {links?.next
            ? <Link className="week-arrow" href={links.next} aria-label="Next day" scroll={false}>›</Link>
            : <span className="week-arrow" aria-hidden="true">›</span>}
        </nav>
      </div>
      {!jobs.length ? (
        <p className="note">No jobs on your route {when}.</p>
      ) : (
        <>
          <p className="note">
            {jobs.length} job{jobs.length === 1 ? '' : 's'}. {noAutopay} customer{noAutopay === 1 ? '' : 's'} without auto-pay. Offer the services listed under Upsell.
          </p>
          <div className="board-wrap">
            <table className="board route">
              <thead>
                <tr><th>Window</th><th>Customer</th><th>Service</th><th>Auto-pay</th><th>Notes</th><th>Upsell</th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.appointment_id} className={j.done ? 'done-row' : ''}>
                    <td className="num-left">{windowLabel(j.time_window, j.start_time, j.end_time)}{j.done && <span className="cell-sub">Done</span>}</td>
                    <td><strong>{j.customer}</strong></td>
                    <td>{j.service}</td>
                    <td>{j.autopay ? <span className="pill pill-good">Yes</span> : <span className="pill pill-bad">No</span>}</td>
                    <td>{j.has_notes ? <span className="pill">Has notes</span> : <span className="note">—</span>}</td>
                    <td>
                      {j.upsell?.length
                        ? <span className="codes">{j.upsell.map((c) => <abbr key={c} className="code" title={UPSELL_NAME[c] || c}>{c}</abbr>)}</span>
                        : <span className="note">Has them all</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">GPS general pest · TBS termite bait system (not offered to customers with termite liquid) · MOS mosquito (not offered to customers with mosquito green). AT = anytime. Jobs are in route order. Notes are in FieldRoutes.</p>
        </>
      )}
    </section>
  );
}
