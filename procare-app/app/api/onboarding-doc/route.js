import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMe } from '@/lib/me';

// Onboarding files (change 92). They live in the private onboarding-docs bucket; only this route touches it.
//   POST { action: 'start', name }  → a one-time upload link (C-Suite, the President, HR), the phone uploads straight to storage
//   POST { action: 'delete', id }   → removes the document and its file (same people)
//   GET  ?id=                       → opens the file (a one-minute link) for anyone the document is for

export const dynamic = 'force-dynamic';
const BUCKET = 'onboarding-docs';
const reply = (status, body) => NextResponse.json(body, { status });
const safeName = (s) => String(s || 'document').normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'document';

async function setup() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me) return { error: reply(401, { error: 'Sign in again.' }) };
  const admin = createAdminClient();
  if (!admin) return { error: reply(500, { error: 'SUPABASE_SECRET_KEY is missing.' }) };
  return { supabase, admin, me };
}

export async function POST(request) {
  const a = await setup();
  if (a.error) return a.error;
  const { data: boss } = await a.supabase.rpc('can_manage_onboarding');
  if (!boss) return reply(403, { error: 'Only C-Suite, the President and HR can change Onboarding.' });
  const body = await request.json().catch(() => ({}));

  if (body.action === 'start') {
    const path = `docs/${crypto.randomUUID()}-${safeName(body.name)}`;
    const { data, error } = await a.admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return reply(500, { error: /not found/i.test(error.message) ? 'Onboarding storage isn’t set up yet (run change 92).' : error.message });
    return reply(200, { path: data.path, token: data.token });
  }
  if (body.action === 'delete') {
    const { data: path, error } = await a.supabase.rpc('delete_onboarding_doc', { p_id: body.id });
    if (error) return reply(400, { error: error.message });
    if (path) await a.admin.storage.from(BUCKET).remove([path]);
    return reply(200, { ok: true });
  }
  if (body.action === 'cleanup' && typeof body.path === 'string' && body.path.startsWith('docs/')) {
    // A replaced file: remove the old one once the document points at the new one
    const { data: still } = await a.admin.from('onboarding_docs').select('id').eq('path', body.path).maybeSingle();
    if (!still) await a.admin.storage.from(BUCKET).remove([body.path]);
    return reply(200, { ok: true });
  }
  return reply(400, { error: 'Unknown action.' });
}

export async function GET(request) {
  const a = await setup();
  if (a.error) return a.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return reply(400, { error: 'Which document?' });
  const { data: ok } = await a.supabase.rpc('can_open_onboarding_doc', { p_id: id });
  if (!ok) return reply(403, { error: 'That document isn’t one of yours.' });
  const { data: doc } = await a.admin.from('onboarding_docs').select('path, kind, url').eq('id', id).maybeSingle();
  if (!doc) return reply(404, { error: 'That document is gone.' });
  if (doc.kind === 'link') return NextResponse.redirect(doc.url);
  const { data, error } = await a.admin.storage.from(BUCKET).createSignedUrl(doc.path, 60);
  if (error) return reply(500, { error: error.message });
  return NextResponse.redirect(data.signedUrl);
}
