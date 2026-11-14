import { clock } from '@/lib/labels';

const UPSELL_NAME = { GPS: 'General pest', TBS: 'Termite bait system', MOS: 'Mosquito' };

/** A tech's jobs for today: customer last name, auto-pay, notes and what to offer. */
export default function TodayRoute({ jobs }) {
  const noAutopay = jobs.filter((j) => !j.autopay).length;
  return (
    <section className="section" aria-labelledby="route-heading">
      <h2 id="route-heading">Today’s route</h2>
      {!jobs.length ? (
        <p className="note">No jobs on your route today.</p>
      ) : (
        <>
          <p className="note">
            {jobs.length} job{jobs.length === 1 ? '' : 's'}. {noAutopay} customer{noAutopay === 1 ? '' : 's'} without auto-pay. Offer the services listed under Upsell.
          </p>
          <div className="board-wrap">
            <table className="board route">
              <thead>
                <tr><th>Time</th><th>Customer</th><th>Service</th><th>Auto-pay</th><th>Notes</th><th>Upsell</th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.appointment_id} className={j.done ? 'done-row' : ''}>
                    <td className="num-left">{j.start_time ? clock(j.start_time) : '—'}{j.done && <span className="cell-sub">Done</span>}</td>
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
          <p className="note">GPS general pest · TBS termite bait system (not offered to customers with termite liquid) · MOS mosquito (not offered to customers with mosquito green). Notes are in FieldRoutes.</p>
        </>
      )}
    </section>
  );
}
