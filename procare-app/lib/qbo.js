/**
 * QuickBooks Online (server only). The connection (tokens) lives in qbo_connection, which only the secret-key
 * Supabase client can read; the Intuit app's keys live in Vercel env vars:
 *   QBO_CLIENT_ID, QBO_CLIENT_SECRET (from the Intuit Developer app), QBO_ENV ('production' default, or 'sandbox'),
 *   CRON_SECRET (Vercel sends it to the daily sync).
 * P&L comes from the ProfitAndLoss report, one month at a time, summarized by class (each office is a class and
 * Wildlife is its own class), and is saved to qbo_pl_monthly. The balance sheet (change 76) comes from the BalanceSheet
 * report by month and is saved to qbo_bs_monthly (loan and card balances for Finance → Debt).
 */
import { createAdminClient } from './supabase/admin';

// Sign-in addresses come from Intuit's discovery document (Intuit asks apps to use it); these are the fallbacks.
const DISCOVERY = {
  production: 'https://developer.api.intuit.com/.well-known/openid_configuration',
  sandbox: 'https://developer.api.intuit.com/.well-known/openid_sandbox_configuration',
};
const FALLBACK = {
  authorization_endpoint: 'https://appcenter.intuit.com/connect/oauth2',
  token_endpoint: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
  revocation_endpoint: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
};
let discovered = null;
async function endpoints() {
  if (discovered && discovered.at > Date.now() - 24 * 3600 * 1000) return discovered.ep;
  try {
    const res = await fetch(DISCOVERY[process.env.QBO_ENV === 'sandbox' ? 'sandbox' : 'production'], { cache: 'no-store' });
    const j = await res.json();
    const ep = {
      authorization_endpoint: j.authorization_endpoint || FALLBACK.authorization_endpoint,
      token_endpoint: j.token_endpoint || FALLBACK.token_endpoint,
      revocation_endpoint: j.revocation_endpoint || FALLBACK.revocation_endpoint,
    };
    discovered = { at: Date.now(), ep };
    return ep;
  } catch {
    return FALLBACK;
  }
}

/**
 * Error log for Intuit support: every failed QuickBooks call is written to the server log (Vercel → Logs) with
 * Intuit's intuit_tid reference from the response headers, the status and Intuit's error details (never tokens).
 */
function logQbo(what, res, json) {
  console.error('[quickbooks]', JSON.stringify({
    at: new Date().toISOString(), call: what, status: res.status, intuit_tid: res.headers.get('intuit_tid') || null,
    error: json?.error || json?.Fault?.Error?.[0]?.Message || null,
    detail: json?.error_description || json?.Fault?.Error?.[0]?.Detail || null,
    code: json?.Fault?.Error?.[0]?.code || null,
  }));
}

/** QuickBooks no longer accepts the saved sign-in (expired or revoked refresh token): needs Connect again. */
export class ReconnectNeeded extends Error {}
const apiBase = () => (process.env.QBO_ENV === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com');

/**
 * The app's one main address. QuickBooks must send people back to exactly the redirect URI saved in the Intuit app,
 * so connecting always uses this address (APP_URL in Vercel if set), whatever address the browser is on.
 */
export const appUrl = () => (process.env.APP_URL || 'https://procare-app.vercel.app').replace(/\/+$/, '');
export const redirectUri = () => `${appUrl()}/api/qbo/callback`;

export const qboConfigured = () => !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
const basic = () => `Basic ${Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')}`;

export async function authorizeUrl(redirectUri, state) {
  const { authorization_endpoint: AUTH_URL } = await endpoints();
  const q = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID, response_type: 'code', scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri, state,
  });
  return `${AUTH_URL}?${q}`;
}

async function tokenRequest(body) {
  const { token_endpoint: TOKEN_URL } = await endpoints();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    logQbo('token', res, json);
    if (json.error === 'invalid_grant') throw new ReconnectNeeded('QuickBooks no longer accepts the saved connection. Connect QuickBooks again.');
    throw new Error(`QuickBooks sign-in failed (${res.status}): ${json.error_description || json.error || 'no details'}`);
  }
  return json;
}

const expiry = (secs) => new Date(Date.now() + (Number(secs) || 0) * 1000).toISOString();

/** After the person signs in to QuickBooks: trade the code for tokens and save the connection. */
export async function connect(code, realmId, redirectUri, employeeId) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const admin = createAdminClient();
  if (!admin) throw new Error('The server is missing SUPABASE_SECRET_KEY.');
  const row = {
    id: 1, realm_id: realmId, access_token: t.access_token, refresh_token: t.refresh_token,
    access_expires_at: expiry(t.expires_in), refresh_expires_at: expiry(t.x_refresh_token_expires_in),
    connected_by: employeeId || null, connected_at: new Date().toISOString(), last_sync_error: null,
  };
  const { error } = await admin.from('qbo_connection').upsert(row);
  if (error) throw new Error(`Couldn’t save the QuickBooks connection: ${error.message}`);
  try {
    const info = await api(`/companyinfo/${realmId}`);
    const name = info?.CompanyInfo?.CompanyName;
    if (name) await admin.from('qbo_connection').update({ company_name: name }).eq('id', 1);
  } catch { /* the name is only a label */ }
}

/** The saved connection with a fresh access token (refreshed and saved when it's about to expire). */
async function session() {
  const admin = createAdminClient();
  if (!admin) throw new Error('The server is missing SUPABASE_SECRET_KEY.');
  const { data: c } = await admin.from('qbo_connection').select('*').eq('id', 1).maybeSingle();
  if (!c?.refresh_token) throw new Error('QuickBooks isn’t connected yet.');
  if (c.access_token && new Date(c.access_expires_at).getTime() - Date.now() > 5 * 60 * 1000) return c;
  let t;
  try {
    t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
  } catch (e) {
    // Expired or revoked refresh token (invalid grant): forget it so Finance → Settings shows Connect again
    if (e instanceof ReconnectNeeded) {
      await admin.from('qbo_connection').update({ access_token: null, refresh_token: null, access_expires_at: null,
        refresh_expires_at: null, last_sync_error: e.message }).eq('id', 1);
    }
    throw e;
  }
  const upd = {
    access_token: t.access_token, refresh_token: t.refresh_token || c.refresh_token,
    access_expires_at: expiry(t.expires_in), refresh_expires_at: expiry(t.x_refresh_token_expires_in),
  };
  await admin.from('qbo_connection').update(upd).eq('id', 1);
  return { ...c, ...upd };
}

async function api(path, params = {}, retried = false) {
  const c = await session();
  const q = new URLSearchParams({ minorversion: '75', ...params });
  const res = await fetch(`${apiBase()}/v3/company/${c.realm_id}${path}?${q}`, {
    headers: { Authorization: `Bearer ${c.access_token}`, Accept: 'application/json' }, cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && !retried) {
    // Access token rejected early (e.g. revoked): refresh once and try again
    await createAdminClient()?.from('qbo_connection').update({ access_expires_at: new Date(0).toISOString() }).eq('id', 1);
    return api(path, params, true);
  }
  if (!res.ok) {
    logQbo(path, res, json);
    const msg = json?.Fault?.Error?.[0]?.Detail || json?.Fault?.Error?.[0]?.Message || res.statusText;
    const tid = res.headers.get('intuit_tid');
    throw new Error(`QuickBooks said: ${msg} (${res.status}${tid ? `, intuit_tid ${tid}` : ''})`);
  }
  return json;
}

const SECTION = { Income: 'Income', COGS: 'Cost of Goods Sold', Expenses: 'Expenses', OtherIncome: 'Other Income', OtherExpenses: 'Other Expenses' };

/**
 * A ProfitAndLoss report summarized by class → rows { class, section, account_id, account_name, parent_name, amount }.
 * Only account lines are kept (section totals, gross profit and net income are worked out from them).
 */
export function parsePl(report) {
  const cols = report?.Columns?.Column || [];
  const classCols = cols
    .map((c, i) => ({ i, title: (c.ColTitle || '').trim() }))
    .filter((c) => c.i > 0 && c.title && !/^total$/i.test(c.title));
  const out = [];
  const walk = (rows, section, parent) => {
    (rows || []).forEach((r) => {
      if (r.type === 'Section' || r.Rows) {
        const head = r.Header?.ColData?.[0];
        // A sub-account group: its header names the parent account
        walk(r.Rows?.Row, section, head?.value || parent);
        return;
      }
      const cd = r.ColData || [];
      const acct = cd[0];
      if (!acct?.value) return;
      classCols.forEach((c) => {
        const amt = Number(String(cd[c.i]?.value ?? '').replace(/,/g, ''));
        if (!amt) return;
        out.push({
          class: c.title === 'Not Specified' ? 'Not specified' : c.title, section,
          account_id: String(acct.id || acct.value), account_name: acct.value, parent_name: parent || null,
          amount: Math.round(amt * 100) / 100,
        });
      });
    });
  };
  (report?.Rows?.Row || []).forEach((top) => {
    const section = SECTION[top.group];
    if (section) walk(top.Rows?.Row, section, null);
  });
  return out;
}

const ymd = (d) => d.toISOString().slice(0, 10);

/** Copy the last `months` months (this month included) of P&L by class into qbo_pl_monthly. */
export async function syncPl(months = 3) {
  const admin = createAdminClient();
  if (!admin) throw new Error('The server is missing SUPABASE_SECRET_KEY.');
  const now = new Date();
  let lines = 0;
  try {
    for (let k = months - 1; k >= 0; k -= 1) {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      const report = await api('/reports/ProfitAndLoss', {
        start_date: ymd(first), end_date: ymd(last), summarize_column_by: 'Classes', accounting_method: 'Accrual',
      });
      const rows = parsePl(report).map((r) => ({ ...r, month: ymd(first), synced_at: new Date().toISOString() }));
      // Replace the month: lines that went to zero or were reclassed disappear
      const del = await admin.from('qbo_pl_monthly').delete().eq('month', ymd(first));
      if (del.error) throw new Error(del.error.message);
      if (rows.length) {
        const ins = await admin.from('qbo_pl_monthly').insert(rows);
        if (ins.error) throw new Error(ins.error.message);
      }
      lines += rows.length;
    }
    await admin.from('qbo_connection').update({ last_sync_at: new Date().toISOString(), last_sync_error: null }).eq('id', 1);
    return { months, lines };
  } catch (e) {
    await admin.from('qbo_connection').update({ last_sync_error: String(e.message || e).slice(0, 500) }).eq('id', 1);
    throw e;
  }
}

// Balance sheet groups QuickBooks uses (Row.group); the nearest one names the line's group
const BS_GROUPS = new Set(['BankAccounts', 'AR', 'OtherCurrentAssets', 'FixedAssets', 'OtherAssets', 'AP', 'CreditCards',
  'OtherCurrentLiabilities', 'LongTermLiabilities', 'Equity']);
const monthKey = (col) => {
  const meta = Object.fromEntries((col.MetaData || []).map((m) => [m.Name, m.Value]));
  const d = meta.EndDate || meta.StartDate;
  if (d) return `${d.slice(0, 7)}-01`;
  const t = new Date(`1 ${col.ColTitle}`);   // "Nov 2026"
  return Number.isNaN(t.getTime()) ? null : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * A BalanceSheet report summarized by month → rows { month, account_id, section, grp, account_name, parent_name, amount }.
 * Each column is the balance at the end of that month. Only account lines are kept.
 */
export function parseBs(report) {
  const cols = (report?.Columns?.Column || []).map((c, i) => ({ i, month: i > 0 && !/^total$/i.test(c.ColTitle || '') ? monthKey(c) : null }))
    .filter((c) => c.month);
  const out = [];
  const walk = (rows, section, grp, parent) => {
    (rows || []).forEach((r) => {
      if (r.type === 'Section' || r.Rows) {
        const g = r.group || '';
        const sec = g === 'TotalAssets' ? 'Assets' : g === 'Liabilities' ? 'Liabilities' : g === 'Equity' ? 'Equity' : section;
        const head = r.Header?.ColData?.[0];
        const named = BS_GROUPS.has(g) ? g : grp;
        // A header with an account id is a parent account holding sub-accounts
        walk(r.Rows?.Row, sec, named, head?.id ? head.value : parent);
        // The parent account's own balance (QuickBooks puts it on the header line)
        if (head?.id) {
          cols.forEach((c) => {
            const amt = Number(String(r.Header.ColData[c.i]?.value ?? '').replace(/,/g, ''));
            if (amt) out.push({ month: c.month, account_id: String(head.id), section: sec || 'Other', grp: named || null, account_name: head.value, parent_name: parent || null, amount: Math.round(amt * 100) / 100 });
          });
        }
        return;
      }
      const cd = r.ColData || [];
      const acct = cd[0];
      if (!acct?.value || !acct.id) return;
      cols.forEach((c) => {
        const amt = Number(String(cd[c.i]?.value ?? '').replace(/,/g, ''));
        if (!amt) return;
        out.push({ month: c.month, account_id: String(acct.id), section: section || 'Other', grp: grp || null,
          account_name: acct.value, parent_name: parent || null, amount: Math.round(amt * 100) / 100 });
      });
    });
  };
  walk(report?.Rows?.Row, null, null, null);
  // One line per month and account (a parent's header and total can repeat it)
  const seen = new Map();
  for (const r of out) seen.set(`${r.month}|${r.account_id}`, r);
  return [...seen.values()];
}

/** Copy the balance sheet at the end of each of the last `months` months into qbo_bs_monthly (one report call). */
export async function syncBalanceSheet(months = 13) {
  const admin = createAdminClient();
  if (!admin) throw new Error('The server is missing SUPABASE_SECRET_KEY.');
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  try {
    const report = await api('/reports/BalanceSheet', {
      start_date: ymd(first), end_date: ymd(now), summarize_column_by: 'Month', accounting_method: 'Accrual',
    });
    const rows = parseBs(report).map((r) => ({ ...r, synced_at: new Date().toISOString() }));
    const del = await admin.from('qbo_bs_monthly').delete().gte('month', ymd(first));
    if (del.error) throw new Error(del.error.message);
    for (let k = 0; k < rows.length; k += 500) {
      const ins = await admin.from('qbo_bs_monthly').insert(rows.slice(k, k + 500));
      if (ins.error) throw new Error(ins.error.message);
    }
    await admin.from('qbo_connection').update({ bs_sync_error: null }).eq('id', 1);
    return { bsLines: rows.length };
  } catch (e) {
    await admin.from('qbo_connection').update({ bs_sync_error: String(e.message || e).slice(0, 500) }).eq('id', 1);
    return { bsLines: 0, bsError: String(e.message || e) };
  }
}

/** Disconnect: revoke the token at Intuit and forget it here (the copied P&L stays). */
export async function disconnect() {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: c } = await admin.from('qbo_connection').select('refresh_token').eq('id', 1).maybeSingle();
  if (c?.refresh_token && qboConfigured()) {
    const { revocation_endpoint: REVOKE_URL } = await endpoints();
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: basic(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: c.refresh_token }),
    }).catch(() => {});
  }
  await admin.from('qbo_connection').update({ access_token: null, refresh_token: null, access_expires_at: null, refresh_expires_at: null }).eq('id', 1);
}
