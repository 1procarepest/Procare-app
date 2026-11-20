import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { hasSecondStep } from '@/lib/mfa';
import { disconnect } from '@/lib/qbo';

export const dynamic = 'force-dynamic';

/** Finance → Settings → Disconnect (C-Suite / President). The copied P&L stays. */
export async function POST() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 4) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
  if (!(await hasSecondStep(supabase))) return NextResponse.json({ ok: false, error: 'Enter your authenticator code first (open Finance again).' }, { status: 403 });
  await disconnect();
  return NextResponse.json({ ok: true });
}
