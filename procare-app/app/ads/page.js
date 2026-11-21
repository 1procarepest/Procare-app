import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { todayYmd } from '@/lib/repcards';
import { shortDate } from '@/lib/labels';
import { ADS_PERIODS, buildAds, money, money2, pickAdsRange, words } from '@/lib/ads';
import PeriodNav from '../finance/PeriodNav';
import SyncNow from './SyncNow';

export const dynamic = 'force-dynamic';

const when = (t) => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const num = (x) => (Number(x) || 0).toLocaleString('en-US');

/** Ads → Overview: spend, leads, cost per lead and cost per customer, by account and campaign. */
export default async function AdsPage({ searchParams }) {
  const supabase = createClient();
  const range = pickAdsRange(searchParams, todayYmd());
  const { data, error } = await supabase.rpc('ads_data', { p_from: range.from, p_to: range.to });
  if (error) return <p className="error">Ads couldn’t load: {error.message}</p>;
  const conn = data?.connection || {};
  const a = buildAds(data);
  const t = a.total;
  const empty = !(data?.accounts || []).length;

  return (
    <>
      <div className="rc-top brand-head bug-band">
        <div>
          <p className="rc-kicker">Ads · Google</p>
          <h1 className="rc-title">Cost per <em>lead</em></h1>
          <p className="note">{range.label}: {shortDate(range.from)} – {shortDate(range.to)}. Local Services Ads (pay per lead) and search ads (pay per click), with new customers from FieldRoutes.
            {conn.last_sync_at ? ` Updated from Google ${when(conn.last_sync_at)}.` : ''}</p>
        </div>
      </div>
      <PeriodNav base="/ads" range={range} periods={ADS_PERIODS} />

      {empty ? (
        <p className="panel">
          {conn.connected ? 'Google Ads is connected, but no numbers have been copied yet. ' : 'Google Ads isn’t connected yet. '}
          {data?.manage ? <Link href="/ads/settings">Open Settings</Link> : 'Ask John to connect it in Ads → Settings.'}
        </p>
      ) : (
        <>
          <div className="fin-tiles">
            <div className="fin-tile"><span className="rc-label">Total spend</span><strong>{money(t.cost)}</strong>
              <small className="note">{money(t.lsaCost)} Local Services · {money(t.searchCost)} search ads</small></div>
            <div className="fin-tile"><span className="rc-label">New customers</span><strong>{t.customers}</strong>
              <small className="note">{money(t.sold)} sold{a.wildlife.customers ? ` · ${a.wildlife.customers} wildlife` : ''}</small></div>
            <div className="fin-tile"><span className="rc-label">Cost per customer</span><strong>{money2(t.cpc)}</strong><small className="note">all spend</small></div>
          </div>

          <h2 className="fin-h2">Local Services Ads <small className="note">pay per lead</small></h2>
          {a.hasLsa ? (
            <div className="fin-tiles">
              <div className="fin-tile"><span className="rc-label">Spend</span><strong>{money(t.lsaCost)}</strong></div>
              <div className="fin-tile"><span className="rc-label">Leads</span><strong>{t.leads}</strong>
                <small className="note">{t.charged} charged{t.credited ? ` · ${t.credited} credited back` : ''} · {t.booked} booked</small></div>
              <div className="fin-tile"><span className="rc-label">Cost per lead</span><strong>{money2(t.cpl)}</strong><small className="note">per charged lead</small></div>
            </div>
          ) : <p className="note">No Local Services spend or leads in these dates. Leads start once Google finishes the account’s license and insurance checks.</p>}

          {a.hasSearch && (
            <>
              <h2 className="fin-h2">Search ads <small className="note">pay per click</small></h2>
              <div className="fin-tiles">
                <div className="fin-tile"><span className="rc-label">Spend</span><strong>{money(t.searchCost)}</strong></div>
                <div className="fin-tile"><span className="rc-label">Clicks</span><strong>{num(t.clicks)}</strong><small className="note">{num(t.impressions)} times shown</small></div>
                <div className="fin-tile"><span className="rc-label">Cost per click</span><strong>{money2(t.cpClick)}</strong></div>
                <div className="fin-tile"><span className="rc-label">Conversions</span><strong>{num(Math.round(t.conversions))}</strong><small className="note">as Google Ads counts them</small></div>
              </div>
            </>
          )}

          <h2 className="fin-h2">By account</h2>
          <div className="pay-scroll">
            <table className="ops-table fin-table">
              <thead>
                <tr>
                  <th scope="col">Account</th><th scope="col">Total spend</th>
                  <th scope="col">Local Services spend</th><th scope="col">Leads</th><th scope="col">Charged</th><th scope="col">Cost per lead</th>
                  <th scope="col">Search spend</th><th scope="col">Clicks</th><th scope="col">Cost per click</th>
                  <th scope="col">New customers</th><th scope="col">Cost per customer</th>
                </tr>
              </thead>
              <tbody>
                {a.accounts.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}{r.office_name && <small className="fin-unset">{r.office_name}</small>}</th>
                    <td>{money(r.cost)}</td>
                    <td>{money(r.lsaCost)}</td><td>{r.leads}</td><td>{r.charged}</td><td><b>{money2(r.cpl)}</b></td>
                    <td>{money(r.searchCost)}</td><td>{num(r.clicks)}</td><td>{money2(r.cpClick)}</td>
                    <td>{r.customers ?? '–'}</td><td><b>{money2(r.cpc)}</b></td>
                  </tr>
                ))}
                <tr className="fin-sum">
                  <th scope="row">All accounts</th><td>{money(t.cost)}</td>
                  <td>{money(t.lsaCost)}</td><td>{t.leads}</td><td>{t.charged}</td><td><b>{money2(t.cpl)}</b></td>
                  <td>{money(t.searchCost)}</td><td>{num(t.clicks)}</td><td>{money2(t.cpClick)}</td>
                  <td>{t.customers}</td><td><b>{money2(t.cpc)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          {a.services.length > 0 && (
            <>
              <h2 className="fin-h2">Local Services leads by service</h2>
              <div className="pay-scroll">
                <table className="ops-table fin-table">
                  <thead><tr><th scope="col">Service</th><th scope="col">Leads</th><th scope="col">Charged</th><th scope="col">Credited back</th><th scope="col">Booked</th></tr></thead>
                  <tbody>
                    {a.services.map((s) => <tr key={s.name}><th scope="row">{s.name}</th><td>{s.leads}</td><td>{s.charged}</td><td>{s.credited}</td><td>{s.booked}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <p className="calc-hint">By how they reached us: {a.types.map((x) => `${x.name} ${x.leads}`).join(' · ')}.</p>
            </>
          )}

          {a.campaigns.length > 0 && (
            <>
              <h2 className="fin-h2">Campaigns</h2>
              <div className="pay-scroll">
                <table className="ops-table fin-table">
                  <thead><tr><th scope="col">Campaign</th><th scope="col">Account</th><th scope="col">Type</th><th scope="col">Spend</th><th scope="col">Impressions</th><th scope="col">Clicks</th><th scope="col">Conversions</th></tr></thead>
                  <tbody>
                    {a.campaigns.map((c) => (
                      <tr key={`${c.customer_id}-${c.campaign_id}`}>
                        <th scope="row">{c.campaign_name || c.campaign_id}</th><td>{c.account}</td>
                        <td>{c.local_services ? 'Local Services' : words(c.channel_type)}</td>
                        <td>{money(c.cost)}</td><td>{num(c.impressions)}</td><td>{num(c.clicks)}</td><td>{num(Math.round(c.conversions))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {conn.connected && <div className="panel-buttons"><SyncNow /></div>}
      {conn.last_sync_error && <p className="error">Last copy from Google had a problem: {conn.last_sync_error}</p>}
      <p className="calc-hint">
        Local Services and search ads are counted apart. Cost per lead = Local Services spend ÷ charged leads (Google charges only for valid leads; leads it credits back don’t count). Cost per click = search spend ÷ clicks.
        New customers = FieldRoutes customers added in these dates whose purchase came in under a Google lead source
        ({(data?.fr_sources || []).join(', ') || 'none picked yet'}). Cost per customer = all spend ÷ those customers. Sold = their contract value.
        Accounts tied to an office show that office’s customers. Google numbers refresh every morning; Sync now pulls the last 7 days.
      </p>
    </>
  );
}
