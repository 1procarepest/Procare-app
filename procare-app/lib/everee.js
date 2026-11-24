// Everee (sales pay, later prize payouts). Server only: EVEREE_API_TOKEN and EVEREE_TENANT_ID live in Vercel.
// https://developer.everee.com/docs/authentication-api-tokens — Basic auth with the token as the user name, plus the
// x-everee-tenant-id header. Sandbox and production share api.everee.com; the token decides which: tsk_test_ = sandbox
// (Everee's test company), tsk_prod_ = real payroll. Read-only for now: nothing here moves money.

const BASE = 'https://api.everee.com/integration/v1';
const token = () => String(process.env.EVEREE_API_TOKEN || '').trim();
const tenant = () => String(process.env.EVEREE_TENANT_ID || '').trim();

export const evereeConfigured = () => !!token() && !!tenant();

/** 'sandbox' | 'production' | 'unknown', from the token's start. */
export function evereeEnv() {
  const t = token();
  if (t.startsWith('tsk_test_')) return 'sandbox';
  if (t.startsWith('tsk_prod_')) return 'production';
  return 'unknown';
}

async function ev(path) {
  if (!evereeConfigured()) throw new Error('EVEREE_API_TOKEN and EVEREE_TENANT_ID need to be set in Vercel (then redeploy).');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(`${BASE}${path}`, {
      cache: 'no-store',
      headers: {
        Authorization: `Basic ${Buffer.from(`${token()}:`).toString('base64')}`,
        'x-everee-tenant-id': tenant(),
        Accept: 'application/json',
      },
    });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 700 * attempt)); continue; }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Everee didn’t accept the keys (${res.status}). Check that the token and tenant ID are from the same Everee company${json.errorMessage ? `: ${json.errorMessage}` : '.'}`);
    }
    if (!res.ok) throw new Error(`Everee said (${res.status}): ${json.errorMessage || res.statusText}`);
    return json;
  }
  throw new Error('Everee kept saying it was busy. Try again in a minute.');
}

/** The read-only connection check: asks for one worker. Returns { env, workers, tenant }. */
export async function evereeCheck() {
  const page = await ev('/workers?size=1');
  return { env: evereeEnv(), workers: Number(page?.totalItems ?? 0), tenant: tenant() };
}

/** Every worker on file (all statuses), 100 at a time. */
export async function evereeWorkers() {
  const out = [];
  for (let page = 0; page < 20; page += 1) {
    const r = await ev(`/workers?size=100&page=${page}`);
    out.push(...(r?.items || []));
    if (!r || page + 1 >= Number(r.totalPages || 0)) break;
  }
  return out;
}
