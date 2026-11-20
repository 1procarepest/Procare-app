/**
 * Second sign-in step (MFA, 2026-11-19) for Finance: a 6-digit code from an authenticator app (Supabase TOTP).
 * After the code, the sign-in token says aal2 ("second step done"); the database only shows Finance data to aal2
 * sessions (change 67), so the pages and the data both require it.
 */
export async function hasSecondStep(supabase) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.aal === 'aal2';
}

/** Where to send someone who still needs the second step, then back to `next`. */
export const verifyHref = (next) => `/verify?next=${encodeURIComponent(next || '/finance')}`;
