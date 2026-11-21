import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { sendEmail } from '@/lib/email';
import { OFFICE_NAME } from '@/lib/labels';
import { DOC_KIND, truckName, usDate, dollars } from '@/lib/trucks';

// Change 75: a truck was added to the fleet or taken off it (sold, totaled, returned) → one email to the insurance
// agent (add / remove it on the auto policy) and one to the bookkeeper (record the purchase or sale and the loan).
// { id } is the truck_log row ('added' or 'removed'). Only C-Suite / the President (can_see_finance) can send, and
// each change is emailed once (truck_log.emailed_at); a failed send can be tried again from the truck.

const reply = (status, body) => NextResponse.json(body, { status });

export async function POST(request) {
  const { id } = await request.json().catch(() => ({}));
  if (!id) return reply(400, { message: 'Missing id.' });

  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!me) return reply(401, { message: 'Sign in again.' });
  const { data: allowed } = await supabase.rpc('can_see_finance');
  if (!allowed) return reply(403, { message: 'Only C-Suite and the President (with the authenticator step) can send these.' });

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return reply(500, { message: 'SUPABASE_SECRET_KEY is missing.' });
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: ev } = await admin.from('truck_log').select('*').eq('id', id).maybeSingle();
  if (!ev || !['added', 'removed'].includes(ev.kind)) return reply(404, { message: 'Nothing to email for that.' });
  if (ev.emailed_at) return reply(200, { ok: true, already: true, message: 'Already emailed.' });

  const [{ data: t }, { data: loans }, { data: s }] = await Promise.all([
    admin.from('trucks').select('*').eq('id', ev.truck_id).maybeSingle(),
    admin.from('truck_loans').select('*').eq('truck_id', ev.truck_id).order('start_on', { ascending: false }),
    admin.from('fleet_settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  if (!t) return reply(404, { message: 'That truck is gone.' });
  const loan = (loans || [])[0] || null;

  // The paperwork for the bookkeeper (change 77): purchase + finance agreements when added, the bill of sale when sold
  const { data: docs } = await admin.from('truck_documents').select('*').eq('truck_id', ev.truck_id).order('created_at');
  const attachments = [];
  const attached = [];
  let room = 30 * 1024 * 1024;
  for (const doc of (docs || []).filter((x) => DOC_KIND[x.kind]?.when === ev.kind)) {
    const { data: file } = await admin.storage.from('truck-docs').download(doc.path);
    if (!file) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > room) continue;
    room -= buf.length;
    const ext = (doc.name.match(/\.[A-Za-z0-9]{2,5}$/) || [''])[0];
    attachments.push({ filename: `Truck ${t.truck_no || ''} ${DOC_KIND[doc.kind].label}${ext}`.replace(/\s+/g, ' '), content: buf.toString('base64') });
    attached.push(`${DOC_KIND[doc.kind].label}${doc.qbo_attachable_id ? ' (also in QuickBooks Attachments)' : ''}`);
  }
  const added = ev.kind === 'added';
  const sold = t.status === 'sold';
  const when = usDate(ev.day);
  const vehicle = truckName(t);
  const sender = `${me.first_name} ${me.last_name}`.trim();
  const facts = [
    `Vehicle: ${vehicle}`,
    `VIN: ${t.vin || 'not on file'}`,
    t.plate && !/temp/i.test(t.plate) ? `Plate: ${t.plate}` : null,
    t.truck_no ? `Our truck #: ${t.truck_no}` : null,
    t.office ? `Garaged at: Procare Pest, ${OFFICE_NAME[t.office] || t.office}` : null,
  ].filter(Boolean);
  const footer = `Sent from the Procare Pest team app by ${sender}. Reply to this email with any questions.`;
  const cc = [s?.reply_to, user?.email].filter((e) => e && !/@example\./.test(e));
  const replyTo = s?.reply_to || user?.email;
  const results = [];
  // A retry after a partial send skips whoever already got it
  const prev = ev.email_result || '';
  const sentBefore = (who) => prev.split(' · ').find((x) => x.startsWith(who) && x.endsWith(': sent'));

  // Insurance agent: add to / take off the policy
  if (sentBefore('Insurance')) results.push(sentBefore('Insurance'));
  else if (s?.insurance_email) {
    const first = (s.insurance_name || '').split(' ')[0];
    const r = await sendEmail({
      to: [s.insurance_email], cc, replyTo, footer,
      subject: added ? `Procare Pest: please add a vehicle to our auto policy (${vehicle})` : `Procare Pest: please remove a vehicle from our auto policy (${vehicle})`,
      heading: added ? 'Please add this vehicle to our policy' : 'Please remove this vehicle from our policy',
      lines: [
        first ? `Hi ${first},` : 'Hello,',
        added ? `We added a vehicle to the fleet on ${when}. Please add it to Procare Pest’s commercial auto policy as of that date.`
              : `${sold ? 'We sold' : 'We took'} this vehicle ${sold ? '' : 'off the fleet '}on ${when}${t.removed_reason && !sold ? ` (${t.removed_reason})` : ''}. Please remove it from Procare Pest’s commercial auto policy as of that date.`,
        ...facts,
        added && loan?.lender ? `Lienholder: ${loan.lender}` : null,
        'Thank you,',
        `${sender}, Procare Pest`,
      ].filter(Boolean),
    });
    results.push(`Insurance (${s.insurance_email}): ${r.ok ? 'sent' : r.problem}`);
  } else results.push('Insurance: no email address set');

  // Bookkeeper: record the purchase or the sale and the loan
  if (sentBefore('Bookkeeper')) results.push(sentBefore('Bookkeeper'));
  else if (s?.bookkeeper_email) {
    const first = (s.bookkeeper_name || '').split(' ')[0];
    const loanLines = loan ? [
      `Loan: ${loan.lender || 'lender not on file'}${loan.payment ? `, ${dollars(loan.payment, true)} a month` : ''}${loan.rate ? ` at ${Number(loan.rate)}%` : ''}`,
      loan.financed ? `Amount financed: ${dollars(loan.financed, true)}${loan.start_on ? `, ${usDate(loan.start_on)} to ${usDate(loan.end_on)}` : ''}` : null,
      !added ? (loan.paid_off || Number(loan.balance) === 0 ? 'Loan balance: paid off' : loan.balance != null ? `Loan balance to pay off: ${dollars(loan.balance, true)}${loan.balance_on ? ` (as of ${usDate(loan.balance_on)})` : ''}` : null) : null,
    ].filter(Boolean) : ['Loan: none on file (paid in cash or paid off)'];
    const r = await sendEmail({
      to: [s.bookkeeper_email], cc, replyTo, footer, attachments,
      subject: added ? `Procare Pest: vehicle purchased (${vehicle})` : `Procare Pest: vehicle ${sold ? 'sold' : 'off the fleet'} (${vehicle})`,
      heading: added ? 'Vehicle added to the fleet' : sold ? 'Vehicle sold' : 'Vehicle taken off the fleet',
      lines: [
        first ? `Hi ${first},` : 'Hello,',
        added ? `We added this vehicle on ${when}. Please record the purchase${loan ? ' and the loan' : ''}.`
              : sold ? `We sold this vehicle on ${when}. Please record the sale${loan && !loan.paid_off ? ' and the loan payoff' : ''}.`
                     : `This vehicle came off the fleet on ${when}${t.removed_reason ? ` (${t.removed_reason})` : ''}. Please record it.`,
        ...facts,
        added && t.purchase_price ? `Purchase price: ${dollars(t.purchase_price, true)}` : null,
        sold && t.sold_price ? `Sale price: ${dollars(t.sold_price, true)}` : null,
        sold && t.sold_to ? `Sold to: ${t.sold_to}` : null,
        ...loanLines,
        attached.length ? `Attached: ${attached.join(', ')}` : null,
        'Thank you,',
        `${sender}, Procare Pest`,
      ].filter(Boolean),
    });
    results.push(`Bookkeeper (${s.bookkeeper_email}): ${r.ok ? 'sent' : r.problem}`);
  } else results.push('Bookkeeper: no email address set (Operations → Trucks → Email settings)');

  const ok = results.every((x) => /: sent$/.test(x));
  const anySent = results.some((x) => /: sent$/.test(x));
  await admin.from('truck_log').update({ emailed_at: ok ? new Date().toISOString() : null, email_result: results.join(' · ') }).eq('id', id);
  return reply(200, { ok, anySent, message: results.join(' · ') });
}
