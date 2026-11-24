import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evereeCheck, evereeConfigured } from '@/lib/everee';

export const dynamic = 'force-dynamic';

/** Sales → Pay → Plans "Test connection": one read-only request to Everee. Only people who manage pay. */
export async function GET() {
  const supabase = createClient();
  const { data: boss } = await supabase.rpc('can_manage_pay');
  if (!boss) return NextResponse.json({ ok: false, message: 'Only people who manage pay can test Everee.' }, { status: 403 });
  if (!evereeConfigured()) return NextResponse.json({ ok: false, message: 'The Everee keys aren’t in Vercel yet (EVEREE_API_TOKEN and EVEREE_TENANT_ID), or the app hasn’t been redeployed since they were added.' });
  try {
    return NextResponse.json({ ok: true, ...(await evereeCheck()) });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e.message });
  }
}
