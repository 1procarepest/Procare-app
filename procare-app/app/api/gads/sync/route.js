import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { syncGoogle } from '@/lib/ga';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily (Vercel cron, with CRON_SECRET): the last 30 days of ads and website (Google adjusts recent numbers). */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncGoogle(30)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

/** Ads → Sync now: anyone who can see Ads (the last 7 days); C-Suite / President can ask for up to 2 years ({ days }). */
export async function POST(request) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || !(me.rank >= 4 || me.ads_access)) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const days = me.rank >= 4 ? Math.min(730, Math.max(1, parseInt(body?.days, 10) || 7)) : 7;
  try {
    return NextResponse.json({ ok: true, ...(await syncGoogle(days)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
