import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsFor } from '@/lib/apps';
import { todayYmd } from '@/lib/repcards';
import { historyOf, loadRoster, readPeriod } from '@/lib/repcardsData';

export const dynamic = 'force-dynamic';

/**
 * Rep Cards "Show 6–10" / "Show everyone else": the history tables for the cards asked for (?ids=a,b,c),
 * so the page itself only carries the top cards' tables.
 */
export async function GET(request) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user || !me || !appsFor(me.department, me.level).includes('sales')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const ids = new Set(String(sp.ids || '').split(',').filter(Boolean).slice(0, 200));
  const today = todayYmd();
  const period = readPeriod(sp, today);
  const roster = await loadRoster(supabase, { ...period, today });
  if (roster.error) return NextResponse.json({ error: roster.error.message }, { status: 500 });
  const out = {};
  roster.reps.forEach((r) => { if (ids.has(r.id)) out[r.id] = historyOf(r); });
  return NextResponse.json(out);
}
