import { cache } from 'react';
import { RANK } from './labels';
import { createClient } from './supabase/server';

/**
 * Who's signed in, worked out once per page load. The layout, the page and the top bar all ask, so React's
 * cache() shares one answer instead of asking Supabase each time (outside a page, e.g. an API route, it just runs).
 * getClaims() checks the sign-in token locally when the project uses signing keys (no trip to Supabase Auth);
 * otherwise it asks Supabase Auth, the same as getUser(). The middleware has already refreshed the token.
 */
const loadMe = cache(async () => {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { user: null, me: null };
  const user = { id: claims.sub, email: claims.email || '' };
  const { data: me } = await supabase
    .from('employees')
    .select('*, offices(name)')   // * so new columns (e.g. wildlife_access, change 63) never break sign-in
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (me) me.rank = RANK[me.level] || 0;
  return { user, me };
});

/**
 * The signed-in auth user ({ id, email }) and their active employee record (or null).
 * Callers still pass their Supabase client; it isn't needed (the shared lookup makes its own).
 */
export async function getMe() {
  const { user, me } = await loadMe();
  // A copy, so a page adding fields to `me` doesn't change what the next caller sees
  return { user, me: me ? { ...me } : null };
}
