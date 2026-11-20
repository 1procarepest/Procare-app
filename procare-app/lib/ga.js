/**
 * Google Analytics 4 (server only), change 72: the website's visits, sources, pages and key events for Ads -> Website.
 * Uses the Google Ads sign-in (lib/gads.js), which also asks for read-only Analytics. Needs the Google Analytics Data
 * API and Admin API turned on in the Google Cloud project "Procare App". No extra keys.
 */
import { createAdminClient } from './supabase/admin';
import { accessToken, syncAds } from './gads';

/** Analytics answered "this sign-in can't read Analytics": the connection predates change 72. */
export const NEEDS_RECONNECT = 'Analytics needs one more permission: in Ads -> Settings, Disconnect, then Connect Google Ads again and allow Analytics.';

async function call(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || res.statusText;
    console.error('[google-analytics]', JSON.stringify({ status: res.status, error: msg, reason: json?.error?.details?.[0]?.reason || null }));
    if (res.status === 403 && /scope/i.test(`${msg} ${JSON.stringify(json?.error?.details || '')}`)) throw new Error(NEEDS_RECONNECT);
    throw new Error(`Google Analytics said: ${msg} (${res.status})`);
  }
  return json;
}

/** The Analytics properties this sign-in can see: [{ id, name, account }]. */
export async function listProperties() {
  const out = [];
  let pageToken = '';
  do {
    const j = await call(`https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    (j.accountSummaries || []).forEach((a) => (a.propertySummaries || []).forEach((p) => out.push({
      id: String(p.property || '').replace(/\D/g, ''), name: p.displayName || p.property, account: a.displayName || '',
    })));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

const ymd = (d) => d.toISOString().slice(0, 10);
const day = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;   // GA's 20261120 → 2026-11-20
const num = (x) => Number(x) || 0;

async function report(property, from, to, dimensions, metrics, extra = {}) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const j = await call(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
      dateRanges: [{ startDate: from, endDate: to }], dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })), limit: 10000, offset, keepEmptyRows: false, ...extra,
    });
    (j.rows || []).forEach((r) => rows.push({
      d: (r.dimensionValues || []).map((v) => v.value ?? ''), m: (r.metricValues || []).map((v) => num(v.value)),
    }));
    offset += 10000;
    if (!j.rows || offset >= num(j.rowCount)) return rows;
  }
}

async function replace(a, table, from, to, rows) {
  const del = await a.from(table).delete().gte('date', from).lte('date', to);
  if (del.error) throw new Error(del.error.message);
  for (let i = 0; i < rows.length; i += 1000) {
    const ins = await a.from(table).insert(rows.slice(i, i + 1000));
    if (ins.error) throw new Error(ins.error.message);
  }
}

/**
 * Copy the last `days` days of the website's Analytics. If no property is picked yet and the sign-in sees exactly
 * one, that one is used. Returns { property, sessions } or { skipped: reason }.
 */
export async function syncWebsite(days = 30) {
  const a = createAdminClient();
  if (!a) throw new Error('The server is missing SUPABASE_SECRET_KEY.');
  const { data: c } = await a.from('gads_connection').select('refresh_token, ga_property').eq('id', 1).maybeSingle();
  if (!c?.refresh_token) return { skipped: 'Google isn’t connected.' };
  let property = c.ga_property;
  if (!property) {
    const props = await listProperties();
    if (props.length !== 1) return { skipped: props.length ? 'Pick the website’s Analytics property in Ads -> Settings.' : 'This Google login can’t see any Google Analytics property.' };
    property = props[0].id;
    await a.from('gads_connection').update({ ga_property: property, ga_property_name: props[0].name }).eq('id', 1);
  }
  const to = new Date();
  const from = ymd(new Date(to.getTime() - (days - 1) * 86400000));
  const end = ymd(to);

  const src = await report(property, from, end, ['date', 'sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium'],
    ['sessions', 'totalUsers', 'newUsers', 'engagedSessions', 'keyEvents']);
  await replace(a, 'ga_daily_source', from, end, src.map((r) => ({
    date: day(r.d[0]), channel: r.d[1] || '(not set)', source: r.d[2] || '(not set)', medium: r.d[3] || '(not set)',
    sessions: r.m[0], users: r.m[1], new_users: r.m[2], engaged: r.m[3], key_events: r.m[4],
  })));

  const pages = await report(property, from, end, ['date', 'pagePath'], ['screenPageViews', 'sessions', 'keyEvents'],
    { orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }] });
  // Keep each day's top 100 pages (a long tail of one-view pages isn't useful)
  const perDay = {};
  const pageRows = pages.filter((r) => ((perDay[r.d[0]] = (perDay[r.d[0]] || 0) + 1) <= 100)).map((r) => ({
    date: day(r.d[0]), page: (r.d[1] || '/').slice(0, 300), views: r.m[0], sessions: r.m[1], key_events: r.m[2],
  }));
  await replace(a, 'ga_daily_page', from, end, pageRows);

  const events = await report(property, from, end, ['date', 'eventName'], ['keyEvents'],
    { metricFilter: { filter: { fieldName: 'keyEvents', numericFilter: { operation: 'GREATER_THAN', value: { doubleValue: 0 } } } } });
  await replace(a, 'ga_daily_event', from, end, events.map((r) => ({ date: day(r.d[0]), event: r.d[1] || '(not set)', count: r.m[0] })));

  return { property, sessions: src.reduce((t, r) => t + r.m[0], 0) };
}

/**
 * Everything from Google in one go (the daily job, Sync now and Connect): ads first, then the website. One failing
 * doesn't stop the other; problems from both are saved for Ads -> Settings. Throws only if nothing could be copied.
 */
export async function syncGoogle(days = 30) {
  const a = createAdminClient();
  if (!a) throw new Error('The server is missing SUPABASE_SECRET_KEY.');
  const out = { days, notes: [] };
  let adsError = null;
  try {
    const r = await syncAds(days);
    Object.assign(out, r, { notes: (r.notes || []).slice() });
  } catch (e) {
    adsError = e;
    out.notes.push(`Ads: ${String(e.message || e)}`);
  }
  try {
    const w = await syncWebsite(Math.min(days, 400));
    if (w.skipped) out.notes.push(`Website: ${w.skipped}`);
    else out.website = w;
  } catch (e) {
    out.notes.push(`Website: ${String(e.message || e)}`);
  }
  const ok = !adsError || out.website;
  await a.from('gads_connection').update({
    ...(ok ? { last_sync_at: new Date().toISOString() } : {}),
    last_sync_error: out.notes.length ? out.notes.join(' · ').slice(0, 500) : null,
  }).eq('id', 1);
  if (!ok) throw adsError;
  return out;
}
