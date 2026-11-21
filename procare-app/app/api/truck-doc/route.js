import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMe } from '@/lib/me';
import { attachToQuickBooks } from '@/lib/qbo';
import { DOC_KIND, truckName } from '@/lib/trucks';

// Truck documents (change 77). Files live in the private truck-docs bucket; only this route touches it, and only for
// C-Suite / the President with the authenticator step (can_see_finance).
//   POST { action: 'start', truck, name }          → a one-time upload link (the phone uploads straight to storage)
//   POST { action: 'done', truck, path, name, kind, size, mime } → saved on the truck, then sent to QuickBooks
//   POST { action: 'qbo', id }                     → send (again) to QuickBooks
//   POST { action: 'delete', id }                  → removed from the truck and from storage (not from QuickBooks)
//   GET  ?id=                                      → opens the file (a one-minute link)

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const BUCKET = 'truck-docs';
const reply = (status, body) => NextResponse.json(body, { status });

async function allowed() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me) return { error: reply(401, { error: 'Sign in again.' }) };
  const { data: ok } = await supabase.rpc('can_see_finance');
  if (!ok) return { error: reply(403, { error: 'Only C-Suite and the President (with the authenticator step) can open truck documents.' }) };
  const admin = createAdminClient();
  if (!admin) return { error: reply(500, { error: 'SUPABASE_SECRET_KEY is missing.' }) };
  return { supabase, admin, me };
}

const safeName = (s) => String(s || 'document').normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'document';

/** Send one saved document to QuickBooks' Attachments; records the result on the document. */
async function pushToQbo(admin, id) {
  const { data: doc } = await admin.from('truck_documents').select('*').eq('id', id).maybeSingle();
  if (!doc) return { ok: false, text: 'That document is gone.' };
  const [{ data: t }, { data: loans }] = await Promise.all([
    admin.from('trucks').select('truck_no, vin, year, make, model').eq('id', doc.truck_id).maybeSingle(),
    admin.from('truck_loans').select('lender, start_on').eq('truck_id', doc.truck_id).order('start_on', { ascending: false }),
  ]);
  const { data: conn } = await admin.from('qbo_connection').select('refresh_token').eq('id', 1).maybeSingle();
  if (!conn?.refresh_token) {
    await admin.from('truck_documents').update({ qbo_result: 'QuickBooks isn’t connected (Finance → Settings).' }).eq('id', id);
    return { ok: false, text: 'Saved. QuickBooks isn’t connected, so it wasn’t sent there.' };
  }
  try {
    const { data: file, error } = await admin.storage.from(BUCKET).download(doc.path);
    if (error) throw new Error(`Couldn’t read the file: ${error.message}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const label = DOC_KIND[doc.kind]?.label || 'Document';
    const lender = (loans || [])[0]?.lender || null;
    const ext = (doc.name.match(/\.[A-Za-z0-9]{2,5}$/) || [''])[0];
    const r = await attachToQuickBooks({
      buffer, contentType: doc.mime, lender: ['finance', 'purchase'].includes(doc.kind) ? lender : null,
      filename: `Truck ${t?.truck_no || ''} ${label}${ext}`.replace(/\s+/g, ' '),
      note: `${label}: truck ${t?.truck_no || '?'}, ${t ? truckName(t) : ''}, VIN ${t?.vin || 'not on file'}. Sent from the Procare team app.`,
    });
    const text = r.vendor ? `In QuickBooks, attached to ${r.vendor}` : 'In QuickBooks Attachments';
    await admin.from('truck_documents').update({ qbo_attachable_id: r.id, qbo_result: text, qbo_sent_at: new Date().toISOString() }).eq('id', id);
    return { ok: true, text };
  } catch (e) {
    const text = String(e.message || e).slice(0, 300);
    await admin.from('truck_documents').update({ qbo_result: text }).eq('id', id);
    return { ok: false, text: `Saved, but QuickBooks didn’t take it: ${text}` };
  }
}

export async function POST(request) {
  const a = await allowed();
  if (a.error) return a.error;
  const { supabase, admin } = a;
  const body = await request.json().catch(() => ({}));

  if (body.action === 'start') {
    if (!/^[0-9a-f-]{36}$/.test(body.truck || '')) return reply(400, { error: 'Which truck?' });
    const path = `${body.truck}/${crypto.randomUUID()}-${safeName(body.name)}`;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return reply(500, { error: /not found/i.test(error.message) ? 'The document storage isn’t set up yet (run change 77).' : error.message });
    return reply(200, { path: data.path, token: data.token });
  }
  if (body.action === 'done') {
    const { data: id, error } = await supabase.rpc('add_truck_document', {
      p_truck: body.truck, p_kind: body.kind, p_name: body.name, p_path: body.path, p_size: body.size || null, p_mime: body.mime || null,
    });
    if (error) return reply(400, { error: error.message });
    const q = await pushToQbo(admin, id);
    return reply(200, { ok: true, id, qbo: q });
  }
  if (body.action === 'qbo') {
    return reply(200, { ok: true, qbo: await pushToQbo(admin, body.id) });
  }
  if (body.action === 'delete') {
    const { data: path, error } = await supabase.rpc('delete_truck_document', { p_id: body.id });
    if (error) return reply(400, { error: error.message });
    if (path) await admin.storage.from(BUCKET).remove([path]);
    return reply(200, { ok: true });
  }
  return reply(400, { error: 'Unknown action.' });
}

export async function GET(request) {
  const a = await allowed();
  if (a.error) return a.error;
  const id = new URL(request.url).searchParams.get('id');
  const { data: doc } = await a.admin.from('truck_documents').select('path, name').eq('id', id).maybeSingle();
  if (!doc) return reply(404, { error: 'That document is gone.' });
  const { data, error } = await a.admin.storage.from(BUCKET).createSignedUrl(doc.path, 60);
  if (error) return reply(500, { error: error.message });
  return NextResponse.redirect(data.signedUrl);
}
