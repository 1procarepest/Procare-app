import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMe } from '@/lib/me';
import { samsaraConfigured, syncOdometers, syncSamsara } from '@/lib/samsaraPush';

// Change 81: the truck sheet → Samsara.
//   POST { action: 'preview' }          what would change (C-Suite; changes nothing)
//   POST { action: 'push_all' }         make every change (C-Suite)
//   POST { action: 'push', truck }      one truck, right after a change on the sheet (managers and up; only while it's on)
//   POST { action: 'odometers' }        read every truck's odometer now (managers and up; read only, change 82)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (status, body) => NextResponse.json(body, { status });

export async function POST(request) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me) return reply(401, { ok: false, text: 'Sign in again.' });
  const { data: canSee } = await supabase.rpc('can_see_trucks');
  if (!canSee) return reply(403, { ok: false, text: 'Only managers and up.' });
  if (!samsaraConfigured()) return reply(200, { ok: false, text: 'The Samsara key isn’t set up yet (SAMSARA_API_TOKEN in Vercel).' });
  const admin = createAdminClient();
  if (!admin) return reply(500, { ok: false, text: 'SUPABASE_SECRET_KEY is missing.' });
  const body = await request.json().catch(() => ({}));

  try {
    if (body.action === 'preview' || body.action === 'push_all') {
      if (me.rank < 4) return reply(403, { ok: false, text: 'Only C-Suite and the President.' });
      const r = await syncSamsara(admin, { apply: body.action === 'push_all' });
      return reply(200, { ok: !r.problems.length, ...r });
    }
    if (body.action === 'odometers') {
      const r = await syncOdometers(admin);
      return reply(200, { ok: true, text: `Read ${r.odometers} odometers from Samsara.`, ...r });
    }
    if (body.action === 'push') {
      const { data: s } = await admin.from('fleet_settings').select('samsara_auto').eq('id', 1).maybeSingle();
      if (!s?.samsara_auto) return reply(200, { ok: true, skipped: true });
      const r = await syncSamsara(admin, { ids: [body.truck], apply: true });
      return reply(200, { ok: !r.problems.length, ...r });
    }
  } catch (e) {
    return reply(200, { ok: false, text: String(e.message || e) });
  }
  return reply(400, { ok: false, text: 'Unknown action.' });
}
