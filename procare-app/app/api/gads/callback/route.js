import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { gadsConnect, syncAds } from '@/lib/gads';
import { hasSecondStep } from '@/lib/mfa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Google sends the person back here after they sign in: save the connection, then copy the last 90 days. */
export async function GET(request) {
  const url = new URL(request.url);
  const back = (q) => NextResponse.redirect(`${url.origin}/ads/settings?${q}`);
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 4 || !(await hasSecondStep(supabase))) return NextResponse.redirect(`${url.origin}/`);
  const state = request.cookies.get('gads_state')?.value;
  if (url.searchParams.get('error')) return back('gads=declined');
  if (!state || state !== url.searchParams.get('state')) return back('gads=expired');
  const code = url.searchParams.get('code');
  if (!code) return back('gads=missing');
  try {
    await gadsConnect(code, me.id);
  } catch (e) {
    return back(`gads=error&msg=${encodeURIComponent(String(e.message || e).slice(0, 200))}`);
  }
  try {
    await syncAds(90);
  } catch { /* the connection is saved; the error shows in Settings and the daily sync retries */ }
  const res = back('gads=connected');
  res.cookies.set('gads_state', '', { path: '/api/gads', maxAge: 0 });
  return res;
}
