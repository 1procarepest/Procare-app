import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  // This device only. The default ('global') signed the person out on every phone and computer,
  // so one sign-out kicked everyone using that login back to the sign-in page.
  await createClient().auth.signOut({ scope: 'local' });
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
