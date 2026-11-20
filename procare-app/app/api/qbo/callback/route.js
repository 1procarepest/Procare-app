import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { connect, redirectUri, syncPl } from '@/lib/qbo';
import { hasSecondStep } from '@/lib/mfa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Intuit sends the person back here after they sign in: save the connection, then copy the last 13 months of P&L. */
export async function GET(request) {
  const url = new URL(request.url);
  const back = (q) => NextResponse.redirect(`${url.origin}/finance/settings?${q}`);
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 4 || !(await hasSecondStep(supabase))) return NextResponse.redirect(`${url.origin}/`);
  const state = request.cookies.get('qbo_state')?.value;
  if (url.searchParams.get('error')) return back(`qbo=declined`);
  if (!state || state !== url.searchParams.get('state')) return back('qbo=expired');
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  if (!code || !realmId) return back('qbo=missing');
  try {
    await connect(code, realmId, redirectUri(), me.id);
  } catch (e) {
    return back(`qbo=error&msg=${encodeURIComponent(String(e.message || e).slice(0, 200))}`);
  }
  try {
    await syncPl(13);
  } catch { /* the connection is saved; the error shows in Settings and the daily sync retries */ }
  const res = back('qbo=connected');
  res.cookies.set('qbo_state', '', { path: '/api/qbo', maxAge: 0 });
  return res;
}
