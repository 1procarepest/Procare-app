import { createClient } from '@supabase/supabase-js';

/** Server only: a Supabase client with the secret key (skips row level security). Null if the key is missing. */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
