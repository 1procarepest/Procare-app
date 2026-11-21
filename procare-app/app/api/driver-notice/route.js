import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMe } from '@/lib/me';
import { sendDriverEvent } from '@/lib/driverNotice';

// Change 78: send one driver email (added / removed / full list) right after the switch or the button.
export async function POST(request) {
  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, text: 'Missing id.' }, { status: 400 });
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!me) return NextResponse.json({ ok: false, text: 'Sign in again.' }, { status: 401 });
  const { data: allowed } = await supabase.rpc('can_manage_drivers');
  if (!allowed) return NextResponse.json({ ok: false, text: 'Only C-Suite, the President and HR (with the authenticator step) can send these.' }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, text: 'SUPABASE_SECRET_KEY is missing.' }, { status: 500 });
  const r = await sendDriverEvent(admin, id, { name: `${me.first_name} ${me.last_name}`.trim(), email: user?.email || null });
  return NextResponse.json(r);
}
