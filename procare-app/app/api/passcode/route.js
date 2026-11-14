import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

function reply(status, message) {
  return NextResponse.json({ message }, { status });
}

/**
 * Creates a login or resets a passcode for someone else. Managers and up only, and only for people
 * they manage (a department manager: their department; C-Suite and the President: everyone).
 * Everyone changes their own passcode from their profile instead.
 */
export async function POST(request) {
  const { employeeId, passcode } = await request.json().catch(() => ({}));
  if (!employeeId || !/^\S{6,64}$/.test(String(passcode || ''))) {
    return reply(400, 'Passcodes are 6 to 64 letters, numbers or symbols, with no spaces.');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply(401, 'Sign in again, then try once more.');

  const [{ data: allowed }, { data: rank }] = await Promise.all([
    supabase.rpc('can_manage', { target: employeeId }),
    supabase.rpc('my_rank'),
  ]);
  if (!allowed || (rank || 0) < 3) return reply(403, 'Only the manager over this person’s department can set their passcode.');

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return reply(500, 'The app is missing SUPABASE_SECRET_KEY in Vercel’s environment variables.');

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: emp } = await admin.from('employees').select('email, auth_user_id, active').eq('id', employeeId).maybeSingle();
  if (!emp) return reply(404, 'That person wasn’t found.');
  if (!emp.active) return reply(400, 'Switch this person on before giving them a login.');

  if (emp.auth_user_id) {
    const { error } = await admin.auth.admin.updateUserById(emp.auth_user_id, { password: passcode });
    if (error) return reply(400, error.message);
    return reply(200, 'Passcode reset.');
  }

  const { error } = await admin.auth.admin.createUser({ email: emp.email, password: passcode, email_confirm: true });
  if (error) return reply(400, error.message);
  return reply(200, 'Login created.');
}
