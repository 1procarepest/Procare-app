import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

/**
 * "Forgot passcode?" on the sign-in page. Emails a one-time link (good for an hour) to an active employee's
 * company email; the link opens /login/reset to choose a new passcode. Lives under /login so it works signed out.
 * Always answers the same way, so nobody can use it to find out which emails have an account.
 */
const SAME = { message: 'If that email has a login, a link to set a new passcode is on its way. Check your inbox (and spam) in a minute.' };
const recent = new Map();   // email → last send (per server instance), so the button can't be used to flood an inbox

export async function POST(request) {
  const { email } = await request.json().catch(() => ({}));
  const addr = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(addr)) return NextResponse.json({ message: 'Type your company email.' }, { status: 400 });
  const last = recent.get(addr);
  if (last && Date.now() - last < 2 * 60 * 1000) return NextResponse.json(SAME);
  recent.set(addr, Date.now());

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return NextResponse.json({ message: 'Passcode emails aren’t set up yet. Ask your manager to reset it.' }, { status: 500 });
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: emp } = await admin.from('employees').select('first_name, email, active, auth_user_id').eq('email', addr).maybeSingle();
  if (!emp?.active || !emp.auth_user_id) return NextResponse.json(SAME);

  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: addr });
  const token = data?.properties?.hashed_token;
  if (error || !token) { console.warn('passcode reset link failed', error?.message); return NextResponse.json(SAME); }

  const origin = new URL(request.url).origin;
  const { problem } = await sendEmail({
    to: [addr],
    subject: 'Set a new passcode for the Procare Team app',
    heading: `Hi ${emp.first_name || 'there'}, here’s your passcode link`,
    lines: [
      'Someone (hopefully you) asked to set a new passcode for the Procare Team app.',
      'The button below works once, for the next hour.',
      'Didn’t ask for this? Ignore this email. Your passcode stays the same.',
    ],
    link: { href: `${origin}/login/reset?token_hash=${encodeURIComponent(token)}`, label: 'Set a new passcode' },
  });
  if (problem) console.warn('passcode reset email', problem);
  return NextResponse.json(SAME);
}
