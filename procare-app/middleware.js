import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Keeps the login fresh and sends anyone who isn't signed in to /login.
export async function middleware(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() refreshes an expiring token, then checks it locally when the project uses signing keys
  // (no trip to Supabase Auth on every click); without signing keys it asks Supabase Auth like getUser().
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  const path = request.nextUrl.pathname;

  // The daily QuickBooks sync (Vercel cron) checks its own secret instead of a sign-in
  if (path === '/api/qbo/sync' && request.method === 'GET') return response;
  if (!user && !path.startsWith('/login')) {
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    return NextResponse.redirect(to);
  }
  if (user && path.startsWith('/login')) {
    const to = request.nextUrl.clone();
    to.pathname = '/';
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // Pages and API routes only: images, icons and other files in public/ don't need a sign-in check
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|txt|woff2?)$).*)'],
};
