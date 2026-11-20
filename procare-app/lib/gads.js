/**
 * Google Ads API (server only), change 71. Read-only: spend by day and campaign, and Google Guaranteed (Local Services)
 * leads, for every ad account under the Procare manager account. The Google sign-in (refresh token) lives in
 * gads_connection, which only the secret-key Supabase client can read. Keys live in Vercel env vars:
 *   GADS_CLIENT_ID, GADS_CLIENT_SECRET (Google Cloud project "Procare App", OAuth client),
 *   GADS_DEVELOPER_TOKEN (Google Ads manager account -> Admin -> API Center),
 *   GADS_LOGIN_CUSTOMER_ID (the manager account, digits only: 1004026960),
 *   GADS_API_VERSION (optional, e.g. v23: Google retires each version about a year after it comes out).
 */
import { createAdminClient } from './supabase/admin';
import { appUrl } from './qbo';

const VERSION = () => process.env.GADS_API_VERSION || 'v23';
const digits = (s) => String(s || '').replace(/\D/g, '');
const LOGIN = () => digits(process.env.GADS_LOGIN_CUSTOMER_ID);
const SCOPE = 'https://www.googleapis.com/auth/adwords openid email';

export const gadsRedirectUri = () => `${appUrl()}/api/gads/callback`;
export const gadsConfigured = () => !!(process.env.GADS_CLIENT_ID && process.env.GADS_CLIENT_SECRET);
export const gadsTokenReady = () => !!process.env.GADS_DEVELOPER_TOKEN;

/** Google no longer accepts the saved sign-in (revoked or expired): needs Connect again. */
export class GadsReconnectNeeded extends Error {}

function admin() {
  const a = createAdminClient();
  if (!a) throw new Error('The server is missing SUPABASE_SECRET_KEY.');
  return a;
}

export function gadsAuthorizeUrl(state) {
  const q = new URLSearchParams({
    client_id: process.env.GADS_CLIENT_ID, redirect_uri: gadsRedirectUri(), response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: process.env.GADS_CLIENT_ID, client_secret: process.env.GADS_CLIENT_SECRET, ...body }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[google-ads]', JSON.stringify({ call: 'token', status: res.status, error: json.error || null, detail: json.error_description || null }));
    if (json.error === 'invalid_grant') throw new GadsReconnectNeeded('Google no longer accepts the saved connection. Connect Google Ads again.');
    throw new Error(`Google sign-in failed (${res.status}): ${json.error_description || json.error || 'no details'}`);
  }
  return json;
}

// The email in Google's sign-in token (only a label: who connected)
function emailOf(idToken) {
  try {
    return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email || null;
  } catch {
    return null;
  }
}

/** After the person signs in to Google: trade the code for a refresh token and save the connection. */
export async function gadsConnect(code, employeeId) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: gadsRedirectUri() });
  if (!t.refresh_token) throw new Error('Google didn’t send a lasting sign-in. Try Connect again.');
  const { error } = await admin().from('gads_connection').upsert({
    id: 1, refresh_token: t.refresh_token, google_email: emailOf(t.id_token), connected_by: employeeId || null,
    connected_at: new Date().toISOString(), last_sync_error: null,
  });
  if (error) throw new Error(`Couldn’t save the Google Ads connection: ${error.message}`);
  cached = { token: t.access_token, until: Date.now() + (Number(t.expires_in) || 0) * 1000 - 120000 };
}

let cached = null;   // the short-lived access token, per server instance
async function accessToken() {
  if (cached && cached.until > Date.now()) return cached.token;
  const a = admin();
  const { data: c } = await a.from('gads_connection').select('refresh_token').eq('id', 1).maybeSingle();
  if (!c?.refresh_token) throw new Error('Google Ads isn’t connected yet.');
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
    cached = { token: t.access_token, until: Date.now() + (Number(t.expires_in) || 0) * 1000 - 120000 };
    return cached.token;
  } catch (e) {
    if (e instanceof GadsReconnectNeeded) await a.from('gads_connection').update({ refresh_token: null, last_sync_error: e.message }).eq('id', 1);
    throw e;
  }
}

/** One GAQL query against an account, every page. Rows come back in the API's camelCase shape. */
export async function gaql(customerId, query) {
  if (!gadsTokenReady()) throw new Error('The Google Ads developer token isn’t in Vercel yet (GADS_DEVELOPER_TOKEN).');
  const rows = [];
  let pageToken;
  do {
    const res = await fetch(`https://googleads.googleapis.com/${VERSION()}/customers/${digits(customerId)}/googleAds:search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken()}`, 'developer-token': process.env.GADS_DEVELOPER_TOKEN,
        ...(LOGIN() ? { 'login-customer-id': LOGIN() } : {}), 'Content-Type': 'application/json',
      },
      body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const first = json?.error?.details?.[0]?.errors?.[0];
      const msg = first?.message || json?.error?.message || res.statusText;
      const requestId = json?.error?.details?.[0]?.requestId || res.headers.get('request-id');
      console.error('[google-ads]', JSON.stringify({ call: 'search', customer: digits(customerId), status: res.status, error: msg, code: first?.errorCode || null, request_id: requestId || null }));
      if (res.status === 401) cached = null;
      throw new Error(`Google Ads said: ${msg} (${res.status}${requestId ? `, request ${requestId}` : ''})`);
    }
    rows.push(...(json.results || []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return rows;
}

const ymd = (d) => d.toISOString().slice(0, 10);
const num = (x) => Number(x) || 0;

/** The ad accounts under the manager account (not sub-managers). */
async function listAccounts() {
  const rows = await gaql(LOGIN(), `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager,
    customer_client.status FROM customer_client WHERE customer_client.level <= 1`);
  return rows.map((r) => r.customerClient).filter((c) => c && !c.manager && String(c.id) !== LOGIN())
    .map((c) => ({ customer_id: String(c.id), name: c.descriptiveName || `Account ${c.id}`, status: c.status || null }));
}

/**
 * Copy the last `days` days (today included) of spend and Google Guaranteed leads for every account.
 * Returns { accounts, days, campaigns, leads, notes }.
 */
export async function syncAds(days = 30) {
  const a = admin();
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  const notes = [];
  let campaigns = 0;
  let leads = 0;
  try {
    const accounts = await listAccounts();
    if (accounts.length === 0) notes.push('No ad accounts are linked to the manager account yet.');
    for (const acct of accounts) {
      const up = await a.from('gads_accounts').upsert({ ...acct, updated_at: new Date().toISOString() }, { onConflict: 'customer_id', ignoreDuplicates: false });
      if (up.error) throw new Error(up.error.message);
    }
    for (const acct of accounts) {
      // Spend by day and campaign (Google Guaranteed shows up as a LOCAL_SERVICES campaign)
      const spend = await gaql(acct.customer_id, `SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type,
        metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign
        WHERE segments.date BETWEEN '${ymd(from)}' AND '${ymd(to)}'`);
      const byKey = {};
      spend.forEach((r) => {
        const k = `${r.segments?.date}|${r.campaign?.id}`;
        const row = (byKey[k] ||= { date: r.segments?.date, customer_id: acct.customer_id, campaign_id: String(r.campaign?.id),
          campaign_name: r.campaign?.name || null, channel_type: r.campaign?.advertisingChannelType || null, cost: 0, impressions: 0, clicks: 0, conversions: 0 });
        row.cost += num(r.metrics?.costMicros) / 1e6;
        row.impressions += num(r.metrics?.impressions);
        row.clicks += num(r.metrics?.clicks);
        row.conversions += num(r.metrics?.conversions);
      });
      const rows = Object.values(byKey).filter((r) => r.date).map((r) => ({ ...r, cost: Math.round(r.cost * 100) / 100, conversions: Math.round(r.conversions * 100) / 100 }));
      const del = await a.from('gads_daily').delete().eq('customer_id', acct.customer_id).gte('date', ymd(from)).lte('date', ymd(to));
      if (del.error) throw new Error(del.error.message);
      if (rows.length) {
        const ins = await a.from('gads_daily').insert(rows);
        if (ins.error) throw new Error(ins.error.message);
      }
      campaigns += rows.length;

      // Google Guaranteed leads (an account without Local Services Ads just has none)
      let lsa = [];
      try {
        lsa = await gaql(acct.customer_id, `SELECT local_services_lead.id, local_services_lead.lead_type, local_services_lead.category_id,
          local_services_lead.service_id, local_services_lead.lead_status, local_services_lead.creation_date_time,
          local_services_lead.lead_charged, local_services_lead.credit_details.credit_state FROM local_services_lead
          WHERE local_services_lead.creation_date_time >= '${ymd(from)} 00:00:00'`);
      } catch (e) {
        notes.push(`${acct.name}: leads couldn’t be read (${String(e.message || e).slice(0, 160)})`);
      }
      const leadRows = lsa.map((r) => r.localServicesLead).filter((l) => l?.id && l.creationDateTime).map((l) => ({
        lead_id: String(l.id), customer_id: acct.customer_id, created_at: String(l.creationDateTime).slice(0, 19),
        lead_type: l.leadType || null, category: l.categoryId || null, service: l.serviceId || null, status: l.leadStatus || null,
        charged: !!l.leadCharged, credit_state: l.creditDetails?.creditState || null, synced_at: new Date().toISOString(),
      }));
      if (leadRows.length) {
        const ins = await a.from('gads_leads').upsert(leadRows, { onConflict: 'lead_id' });
        if (ins.error) throw new Error(ins.error.message);
      }
      leads += leadRows.length;
    }
    await a.from('gads_connection').update({ last_sync_at: new Date().toISOString(), last_sync_error: notes.length ? notes.join(' · ').slice(0, 500) : null }).eq('id', 1);
    return { accounts: accounts.length, days, campaigns, leads, notes };
  } catch (e) {
    await a.from('gads_connection').update({ last_sync_error: String(e.message || e).slice(0, 500) }).eq('id', 1);
    throw e;
  }
}

/** Disconnect: revoke the sign-in at Google and forget it here (copied numbers stay). */
export async function gadsDisconnect() {
  const a = admin();
  const { data: c } = await a.from('gads_connection').select('refresh_token').eq('id', 1).maybeSingle();
  if (c?.refresh_token) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: c.refresh_token }),
    }).catch(() => {});
  }
  cached = null;
  await a.from('gads_connection').update({ refresh_token: null }).eq('id', 1);
}
