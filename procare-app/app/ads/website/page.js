import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { todayYmd } from '@/lib/repcards';
import { shortDate } from '@/lib/labels';
import { ADS_PERIODS, pickAdsRange } from '@/lib/ads';
import PeriodNav from '../../finance/PeriodNav';

export const dynamic = 'force-dynamic';

const n = (x) => Number(x) || 0;
const num = (x) => Math.round(n(x)).toLocaleString('en-US');
const pct = (a, b) => (n(b) > 0 ? `${Math.round((n(a) / n(b)) * 1000) / 10}%` : '–');
// GA event names in plain words: generate_lead → Generate lead
const words = (s) => { const t = String(s || '').replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

function group(rows, key) {
  const m = {};
  rows.forEach((r) => {
    const k = key(r);
    const g = (m[k] ||= { name: k, sessions: 0, users: 0, new_users: 0, engaged: 0, key_events: 0 });
    ['sessions', 'users', 'new_users', 'engaged', 'key_events'].forEach((f) => { g[f] += n(r[f]); });
  });
  return Object.values(m).sort((a, b) => b.sessions - a.sessions);
}

/** Ads → Website: Google Analytics 4 for the website: visits, where they came from, top pages and leads (key events). */
export default async function WebsitePage({ searchParams }) {
  const supabase = createClient();
  const range = pickAdsRange(searchParams, todayYmd());
  const { data, error } = await supabase.rpc('website_data', { p_from: range.from, p_to: range.to });
  if (error) return <p className="error">Website numbers couldn’t load: {error.message}</p>;
  const prop = data?.property || {};
  const sources = data?.sources || [];
  const channels = group(sources, (r) => r.channel);
  const bySource = group(sources, (r) => `${r.source} / ${r.medium}`).slice(0, 15);
  const t = group(sources, () => 'all')[0] || { sessions: 0, users: 0, new_users: 0, engaged: 0, key_events: 0 };

  return (
    <>
      <div className="rc-top brand-head bug-band">
        <div>
          <p className="rc-kicker">Ads · Website{prop.name ? ` · ${prop.name}` : ''}</p>
          <h1 className="rc-title">Website <em>visits</em></h1>
          <p className="note">{range.label}: {shortDate(range.from)} – {shortDate(range.to)}. From Google Analytics: who came to the website, from where, and who reached out.</p>
        </div>
      </div>
      <PeriodNav base="/ads/website" range={range} periods={ADS_PERIODS} />

      {sources.length === 0 ? (
        <p className="panel">
          No website numbers yet.{' '}
          {!prop.connected ? 'Google isn’t connected. ' : !prop.id ? 'The website’s Analytics property hasn’t been picked. ' : 'They copy every morning, or with Sync now. '}
          {data?.manage ? <Link href="/ads/settings">Open Settings</Link> : null}
        </p>
      ) : (
        <>
          <div className="fin-tiles">
            <div className="fin-tile"><span className="rc-label">Visitors</span><strong>{num(t.users)}</strong><small className="note">{num(t.new_users)} new</small></div>
            <div className="fin-tile"><span className="rc-label">Visits</span><strong>{num(t.sessions)}</strong><small className="note">{pct(t.engaged, t.sessions)} engaged</small></div>
            <div className="fin-tile"><span className="rc-label">Website leads</span><strong>{num(t.key_events)}</strong><small className="note">key events</small></div>
            <div className="fin-tile"><span className="rc-label">Visits that became a lead</span><strong>{pct(t.key_events, t.sessions)}</strong></div>
          </div>

          <h2 className="fin-h2">Where visitors came from</h2>
          <div className="pay-scroll">
            <table className="ops-table fin-table">
              <thead><tr><th scope="col">Channel</th><th scope="col">Visits</th><th scope="col">Visitors</th><th scope="col">New</th><th scope="col">Engaged</th><th scope="col">Leads</th><th scope="col">Lead rate</th></tr></thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.name}><th scope="row">{c.name}</th><td>{num(c.sessions)}</td><td>{num(c.users)}</td><td>{num(c.new_users)}</td>
                    <td>{pct(c.engaged, c.sessions)}</td><td>{num(c.key_events)}</td><td>{pct(c.key_events, c.sessions)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="fin-h2">Top sources</h2>
          <div className="pay-scroll">
            <table className="ops-table fin-table">
              <thead><tr><th scope="col">Source / medium</th><th scope="col">Visits</th><th scope="col">Leads</th><th scope="col">Lead rate</th></tr></thead>
              <tbody>
                {bySource.map((c) => <tr key={c.name}><th scope="row">{c.name}</th><td>{num(c.sessions)}</td><td>{num(c.key_events)}</td><td>{pct(c.key_events, c.sessions)}</td></tr>)}
              </tbody>
            </table>
          </div>

          <h2 className="fin-h2">Top pages</h2>
          <div className="pay-scroll">
            <table className="ops-table fin-table">
              <thead><tr><th scope="col">Page</th><th scope="col">Views</th><th scope="col">Visits</th><th scope="col">Leads</th></tr></thead>
              <tbody>
                {(data?.pages || []).map((p) => <tr key={p.page}><th scope="row">{p.page}</th><td>{num(p.views)}</td><td>{num(p.sessions)}</td><td>{num(p.key_events)}</td></tr>)}
              </tbody>
            </table>
          </div>

          <h2 className="fin-h2">Website leads by type</h2>
          {(data?.events || []).length === 0 ? (
            <p className="note">No key events in these dates. In Google Analytics, mark the form-sent and phone-click events as key events (Admin → Events) so website leads show here.</p>
          ) : (
            <ul className="switches">
              {data.events.map((e) => <li key={e.event} className="ads-acct"><span>{words(e.event)}</span><b>{num(e.count)}</b></li>)}
            </ul>
          )}
        </>
      )}
      {prop.last_sync_error && <p className="error">Last copy from Google had a problem: {prop.last_sync_error}</p>}
      <p className="calc-hint">
        Visitors = people (by device); visits = sessions. Leads = Google Analytics key events (e.g. a form sent or a phone
        number tapped), so they depend on what’s marked as a key event in Analytics. Channels are Google’s grouping:
        Paid Search is Google Ads clicks; Google Guaranteed calls mostly don’t visit the website and show on the Overview instead.
      </p>
    </>
  );
}
