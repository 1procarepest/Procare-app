import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMe } from '@/lib/me';
import { loadAgreements } from '@/lib/agreementLoad';

export const dynamic = 'force-dynamic';
const reply = (status, body) => NextResponse.json({ ...body }, { status });
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/**
 * Sales agreements (change 93). The wording is rebuilt here from the plan, so what's saved is exactly what was shown.
 *   POST { action: 'sign', year, hash, name }          the rep signs their own agreement (typed full name)
 *   POST { action: 'countersign', year, rep, hash }    C-Suite or the President signs for ProCare
 */
export async function POST(request) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me) return reply(401, { error: 'Sign in again.' });
  const admin = createAdminClient();
  if (!admin) return reply(500, { error: 'SUPABASE_SECRET_KEY is missing.' });
  const body = await request.json().catch(() => ({}));
  const year = Number(body.year);
  if (!(year >= 2024 && year <= 2100)) return reply(400, { error: 'Which year?' });

  if (body.action === 'sign') {
    const { ready, list } = await loadAgreements(supabase, { years: [year], onlyEmp: me.id });
    if (!ready) return reply(400, { error: 'Run database change 93 in Supabase first.' });
    const it = list[0];
    if (!it) return reply(404, { error: `There’s no ${year} pay plan for you yet, so there’s no agreement to sign.` });
    if (it.agreement.hash !== body.hash) return reply(409, { error: 'The agreement changed while you were reading it. Refresh to read the new version.' });
    if (norm(body.name) !== norm(it.name)) return reply(400, { error: `Type your full name exactly as it appears: ${it.name}.` });
    if (it.state.row) return reply(200, { ok: true });
    const { error } = await admin.from('sales_agreements').insert({
      employee_id: me.id, year, hash: it.agreement.hash, title: it.agreement.title,
      body: { ...it.agreement, signedFrom: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null },
      signed_name: String(body.name).trim(),
    });
    if (error) return reply(400, { error: error.message });
    return reply(200, { ok: true });
  }

  if (body.action === 'countersign') {
    if (me.rank < 4) return reply(403, { error: 'Only C-Suite and the President sign for ProCare.' });
    const { ready, list } = await loadAgreements(supabase, { years: [year], onlyEmp: body.rep });
    if (!ready) return reply(400, { error: 'Run database change 93 in Supabase first.' });
    const it = list[0];
    if (!it?.state.row || it.agreement.hash !== body.hash) return reply(409, { error: 'The rep hasn’t signed this version yet. Refresh the page.' });
    if (it.state.row.company_signed_at) return reply(200, { ok: true });
    const { error } = await admin.from('sales_agreements').update({
      company_signed_by: me.id, company_signed_name: `${me.first_name} ${me.last_name}`.trim(), company_signed_at: new Date().toISOString(),
    }).eq('id', it.state.row.id);
    if (error) return reply(400, { error: error.message });
    return reply(200, { ok: true });
  }
  return reply(400, { error: 'Unknown action.' });
}
