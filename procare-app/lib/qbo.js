/**
 * QuickBooks Online (server only). The connection (tokens) lives in qbo_connection, which only the secret-key
 * Supabase client can read; the Intuit app's keys live in Vercel env vars:
 *   QBO_CLIENT_ID, QBO_CLIENT_SECRET (from the Intuit Developer app), QBO_ENV ('production' default, or 'sandbox'),
 *   CRON_SECRET (Vercel sends it to the daily sync).
 * P&L comes from the ProfitAndLoss report, one month at a time, summarized by class (each office is a class and
 * Wildlife is its own class), and is saved to qbo_pl_monthly.
 */
import { createAdminClient } from './supabase/admin';

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const apiBase = () => (process.env.QBO_ENV === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com');

export const qboConfigured = () => !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
const basic = () => `Basic ${Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')}`;

export function authorizeUrl(redirectUri, state) {
  const q = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID, response_type: 'code', scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri, state,
  });
  return `${AUTH_URL}?${q}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QuickBooks sign-in failed (${res.status}): ${json.error_description || json.error || 'no details'}`);
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
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
  const upd = {
    access_token: t.access_token, refresh_token: t.refresh_token || c.refresh_token,
    access_expires_at: expiry(t.expires_in), refresh_expires_at: expiry(t.x_refresh_token_expires_in),
  };
  await admin.from('qbo_connection').update(upd).eq('id', 1);
  return { ...c, ...upd };
}

async function api(path, params = {}) {
  const c = await session();
  const q = new URLSearchParams({ minorversion: '75', ...params });
  const res = await fetch(`${apiBase()}/v3/company/${c.realm_id}${path}?${q}`, {
    headers: { Authorization: `Bearer ${c.access_token}`, Accept: 'application/json' }, cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.Fault?.Error?.[0]?.Detail || json?.Fault?.Error?.[0]?.Message || res.statusText;
    throw new Error(`QuickBooks said: ${msg} (${res.status})`);
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

/** Disconnect: revoke the token at Intuit and forget it here (the copied P&L stays). */
export async function disconnect() {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: c } = await admin.from('qbo_connection').select('refresh_token').eq('id', 1).maybeSingle();
  if (c?.refresh_token && qboConfigured()) {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: basic(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: c.refresh_token }),
    }).catch(() => {});
  }
  await admin.from('qbo_connection').update({ access_token: null, refresh_token: null, access_expires_at: null, refresh_expires_at: null }).eq('id', 1);
}
