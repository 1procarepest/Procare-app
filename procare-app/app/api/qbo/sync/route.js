import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { hasSecondStep } from '@/lib/mfa';
import { syncPl } from '@/lib/qbo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily (Vercel cron, with CRON_SECRET): refresh the last 3 months (late entries and adjustments). */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncPl(3)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

/** Finance → Settings → Sync now (C-Suite / President): { months } 1–24, default 3. */
export async function POST(request) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 4) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  if (!(await hasSecondStep(supabase))) return NextResponse.json({ ok: false, error: 'Enter your authenticator code first (open Finance again).' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const months = Math.min(24, Math.max(1, parseInt(body?.months, 10) || 3));
  try {
    return NextResponse.json({ ok: true, ...(await syncPl(months)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
