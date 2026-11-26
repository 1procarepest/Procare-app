import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMe } from '@/lib/me';

// Onboarding files (change 92). They live in the private onboarding-docs bucket; only this route touches it.
//   POST { action: 'start', name }  → a one-time upload link (C-Suite, the President, HR), the phone uploads straight to storage
//   POST { action: 'delete', id }   → removes the document and its file (same people)
//   POST { action: 'thumb', id, path } → sets the card picture (a file already uploaded with 'start'), or clears it (path null)
//   POST { action: 'linkthumb', id }  → for a link, finds the website's preview image (og:image) and uses it as the picture
//   GET  ?id=                       → opens the file (a one-minute link) for anyone the document is for
//   GET  ?id=&thumb=1               → the card picture (change 96)

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
    const { data: doc } = await a.admin.from('onboarding_docs').select('thumb_path').eq('id', body.id).maybeSingle();
    const { data: path, error } = await a.supabase.rpc('delete_onboarding_doc', { p_id: body.id });
    if (error) return reply(400, { error: error.message });
    const gone = [path, doc?.thumb_path].filter(Boolean);
    if (gone.length) await a.admin.storage.from(BUCKET).remove(gone);
    return reply(200, { ok: true });
  }
  if (body.action === 'thumb') {
    const { data: old, error } = await a.supabase.rpc('set_onboarding_thumb', { p_id: body.id, p_path: body.path || null, p_url: null });
    if (error) return reply(400, { error: /set_onboarding_thumb|schema cache/i.test(error.message) ? 'Run database change 96 in Supabase first.' : error.message });
    if (old) await a.admin.storage.from(BUCKET).remove([old]);
    return reply(200, { ok: true });
  }
  if (body.action === 'linkthumb') {
    const { data: doc } = await a.admin.from('onboarding_docs').select('url, kind, thumb_path').eq('id', body.id).maybeSingle();
    if (!doc?.url) return reply(400, { error: 'That document isn’t a link.' });
    const img = await previewImage(doc.url);
    if (!img) return reply(200, { ok: false, error: 'That website doesn’t share a preview picture. Upload one instead.' });
    if (doc.thumb_path) return reply(200, { ok: true, kept: true });   // a picture uploaded by hand wins
    const { error } = await a.supabase.rpc('set_onboarding_thumb', { p_id: body.id, p_path: null, p_url: img });
    if (error) return reply(400, { error: error.message });
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

/** A web page's preview picture (og:image / twitter:image), as an absolute https link, or null. */
async function previewImage(url) {
  try {
    if (!/^https?:\/\//i.test(url)) return null;
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProcareTeamApp/1.0)' }, signal: AbortSignal.timeout(6000) });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return null;
    const html = (await res.text()).slice(0, 300000);
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/i);
    const c = m && m[0].match(/content=["']([^"']+)["']/i);
    if (!c) return null;
    const abs = new URL(c[1].replace(/&amp;/g, '&'), res.url).toString();
    return /^https?:\/\//i.test(abs) ? abs.replace(/^http:/i, 'https:') : null;
  } catch { return null; }
}

export async function GET(request) {
  const a = await setup();
  if (a.error) return a.error;
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return reply(400, { error: 'Which document?' });
  const { data: ok } = await a.supabase.rpc('can_open_onboarding_doc', { p_id: id });
  if (!ok) return reply(403, { error: 'That document isn’t one of yours.' });
  const { data: doc } = await a.admin.from('onboarding_docs').select('*').eq('id', id).maybeSingle();
  if (!doc) return reply(404, { error: 'That document is gone.' });
  if (params.get('thumb')) {
    if (doc.thumb_path) {
      const { data, error } = await a.admin.storage.from(BUCKET).createSignedUrl(doc.thumb_path, 3600);
      if (!error) return NextResponse.redirect(data.signedUrl);
    }
    if (doc.thumb_url) return NextResponse.redirect(doc.thumb_url);
    return reply(404, { error: 'No picture.' });
  }
  if (doc.kind === 'link') return NextResponse.redirect(doc.url);
  const { data, error } = await a.admin.storage.from(BUCKET).createSignedUrl(doc.path, 60);
  if (error) return reply(500, { error: error.message });
  return NextResponse.redirect(data.signedUrl);
}
