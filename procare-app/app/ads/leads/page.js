import { createClient } from '@/lib/supabase/server';
import { todayYmd } from '@/lib/repcards';
import { shortDate } from '@/lib/labels';
import { ADS_PERIODS, LEAD_STATUS, pickAdsRange, words } from '@/lib/ads';
import PeriodNav from '../../finance/PeriodNav';

export const dynamic = 'force-dynamic';

const at = (t) => new Date(`${String(t).replace(' ', 'T')}Z`).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Ads → Leads: every Google Guaranteed lead in the dates, newest first. */
export default async function AdsLeadsPage({ searchParams }) {
  const supabase = createClient();
  const range = pickAdsRange(searchParams, todayYmd());
  const { data, error } = await supabase.rpc('ads_data', { p_from: range.from, p_to: range.to });
  if (error) return <p className="error">Leads couldn’t load: {error.message}</p>;
  const name = Object.fromEntries((data?.accounts || []).map((a) => [a.id, a.name]));
  const leads = data?.leads || [];
  const several = (data?.accounts || []).length > 1;

  return (
    <>
      <div className="rc-top brand-head bug-band">
        <div>
          <p className="rc-kicker">Ads · Google Guaranteed</p>
          <h1 className="rc-title">Every <em>lead</em></h1>
          <p className="note">{range.label}: {shortDate(range.from)} – {shortDate(range.to)}. {leads.length} lead{leads.length === 1 ? '' : 's'}, newest first.</p>
        </div>
      </div>
      <PeriodNav base="/ads/leads" range={range} periods={ADS_PERIODS} />
      {leads.length === 0 ? <p className="note">No Google Guaranteed leads in these dates.</p> : (
        <div className="pay-scroll">
          <table className="ops-table fin-table">
            <thead>
              <tr>
                <th scope="col">When</th>{several && <th scope="col">Account</th>}<th scope="col">How</th><th scope="col">Service</th>
                <th scope="col">Status</th><th scope="col">Charged</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.lead_id}>
                  <th scope="row">{at(l.created_at)}</th>{several && <td>{name[l.customer_id] || l.customer_id}</td>}
                  <td>{words(l.lead_type)}</td><td>{words(l.service) || words(l.category)}</td>
                  <td>{LEAD_STATUS[l.status] || words(l.status)}</td>
                  <td>{l.credit_state === 'CREDITED' ? 'Credited back' : l.credit_state === 'PENDING' ? 'Credit requested' : l.charged ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="calc-hint">
        Google charges only for valid leads. If a lead was spam, a wrong number or outside the service area, dispute it in the
        Local Services Ads app; once Google credits it back, it shows here as “Credited back” and stops counting in cost per lead.
      </p>
    </>
  );
}
