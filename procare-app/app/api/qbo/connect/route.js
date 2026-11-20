import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { authorizeUrl, qboConfigured } from '@/lib/qbo';
import { hasSecondStep, verifyHref } from '@/lib/mfa';

export const dynamic = 'force-dynamic';

/** Finance → Settings → Connect QuickBooks: sends C-Suite / the President to Intuit to sign in and pick the company. */
export async function GET(request) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const origin = new URL(request.url).origin;
  if (!me || me.rank < 4) return NextResponse.redirect(`${origin}/`);
  if (!(await hasSecondStep(supabase))) return NextResponse.redirect(`${origin}${verifyHref('/finance/settings')}`);
  if (!qboConfigured()) return NextResponse.redirect(`${origin}/finance/settings?qbo=not-configured`);
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(await authorizeUrl(`${origin}/api/qbo/callback`, state));
  res.cookies.set('qbo_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/qbo', maxAge: 600 });
  return res;
}
