import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appUrl } from '@/lib/qbo';
import { gadsAuthorizeUrl, gadsConfigured } from '@/lib/gads';
import { hasSecondStep, verifyHref } from '@/lib/mfa';

export const dynamic = 'force-dynamic';

/** Ads → Settings → Connect Google Ads (C-Suite / President): sends them to Google to sign in. */
export async function GET(request) {
  const origin = new URL(request.url).origin;
  // Google sends people back only to the redirect address saved in Google Cloud, so connect from the main address
  if (origin !== appUrl()) return NextResponse.redirect(`${appUrl()}/ads/settings`);
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 4) return NextResponse.redirect(`${origin}/`);
  if (!(await hasSecondStep(supabase))) return NextResponse.redirect(`${origin}${verifyHref('/ads/settings')}`);
  if (!gadsConfigured()) return NextResponse.redirect(`${origin}/ads/settings?gads=not-configured`);
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(gadsAuthorizeUrl(state));
  res.cookies.set('gads_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/gads', maxAge: 600 });
  return res;
}
