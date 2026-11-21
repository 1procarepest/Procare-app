// Approved drivers (change 78): the emails to the insurance agent. Server only (uses the secret-key client).
//   added   → "please add this driver"   (name, birth date, license, office, truck)
//   removed → "please remove this driver" (name, birth date, license, to find them on the policy)
//   list    → every approved driver, for a renewal or a full refresh
// Never the home address. Each event is emailed once (driver_events.emailed_at); failures are tried again by the daily
// sync, up to 3 tries in the first 2 weeks.
import { sendEmail } from './email';
import { OFFICE_NAME } from './labels';
import { usDate } from './trucks';

const nameOf = (p) => `${p.first_name} ${p.last_name}`.trim();
const license = (l) => (l?.license_number ? `${l.license_state || ''} ${l.license_number}`.trim() : 'not on file');

export async function sendDriverEvent(admin, id, sender = null) {
  const { data: ev } = await admin.from('driver_events').select('*').eq('id', id).maybeSingle();
  if (!ev) return { ok: false, text: 'Nothing to email.' };
  if (ev.emailed_at) return { ok: true, text: 'Already emailed.' };
  const { data: s } = await admin.from('fleet_settings').select('*').eq('id', 1).maybeSingle();
  const finish = async (ok, text) => {
    await admin.from('driver_events').update({ attempts: ev.attempts + 1, email_result: text, emailed_at: ok ? new Date().toISOString() : null }).eq('id', id);
    return { ok, text };
  };
  if (!s?.insurance_email) return finish(false, 'No insurance agent email set (Operations → Trucks → Email settings).');

  let by = sender;
  if (!by && ev.by_id) {
    const { data: b } = await admin.from('employees').select('first_name, last_name').eq('id', ev.by_id).maybeSingle();
    if (b) by = { name: nameOf(b) };
  }
  const signer = by?.name || 'John';
  const first = (s.insurance_name || '').split(' ')[0];
  const hi = first ? `Hi ${first},` : 'Hello,';
  const common = {
    to: [s.insurance_email], cc: [s.reply_to, by?.email].filter(Boolean), replyTo: s.reply_to || by?.email,
    footer: `Sent from the Procare Pest team app by ${signer}. Reply to this email with any questions.`,
  };
  const day = usDate(ev.created_at.slice(0, 10));

  if (ev.kind === 'list') {
    const { data: people } = await admin.from('employees').select('id, first_name, last_name, office').eq('active', true).eq('approved_driver', true).order('first_name');
    const ids = (people || []).map((p) => p.id);
    const { data: lic } = ids.length ? await admin.from('driver_licenses').select('*').in('employee_id', ids) : { data: [] };
    const byId = Object.fromEntries((lic || []).map((l) => [l.employee_id, l]));
    const rows = (people || []).map((p) => `${nameOf(p)}: born ${usDate(byId[p.id]?.birth_date) || 'not on file'}, license ${license(byId[p.id])}${p.office ? `, ${OFFICE_NAME[p.office] || p.office}` : ''}`);
    const r = await sendEmail({ ...common,
      subject: `Procare Pest: our current driver list (${rows.length} drivers)`,
      heading: 'Our current driver list',
      lines: [hi, `Here is everyone who drives for Procare Pest as of ${day}. Please make sure our auto policy matches.`, ...rows, 'Thank you,', `${signer}, Procare Pest`],
    });
    return finish(r.ok, r.ok ? `Sent to ${s.insurance_email}` : r.problem);
  }

  const { data: p } = await admin.from('employees').select('id, first_name, last_name, office').eq('id', ev.employee_id).maybeSingle();
  if (!p) return finish(false, 'That person is gone.');
  const { data: l } = await admin.from('driver_licenses').select('*').eq('employee_id', p.id).maybeSingle();
  const facts = [`Driver: ${nameOf(p)}`, `Date of birth: ${usDate(l?.birth_date) || 'not on file'}`, `Driver’s license: ${license(l)}`];
  let lines;
  if (ev.kind === 'added') {
    const { data: trucks } = await admin.from('trucks').select('truck_no, year, make, model, vin').eq('driver_id', p.id).in('status', ['active', 'for_sale']);
    lines = [hi, `Please add this driver to Procare Pest’s commercial auto policy as of ${day}.`, ...facts,
      p.office ? `Office: ${OFFICE_NAME[p.office] || p.office}` : null,
      ...(trucks || []).map((t) => `Drives: truck ${t.truck_no}, ${[t.year, t.make, t.model].filter(Boolean).join(' ')}${t.vin ? `, VIN ${t.vin}` : ''}`),
      'Thank you,', `${signer}, Procare Pest`];
  } else {
    lines = [hi, `${nameOf(p)} no longer drives for Procare Pest as of ${day}. Please remove them from our commercial auto policy.`, ...facts,
      'Thank you,', `${signer}, Procare Pest`];
  }
  const r = await sendEmail({ ...common,
    subject: ev.kind === 'added' ? `Procare Pest: please add a driver (${nameOf(p)})` : `Procare Pest: please remove a driver (${nameOf(p)})`,
    heading: ev.kind === 'added' ? 'Please add this driver to our policy' : 'Please remove this driver from our policy',
    lines: lines.filter(Boolean),
  });
  return finish(r.ok, r.ok ? `Sent to ${s.insurance_email}` : r.problem);
}

/** Daily: anything still waiting (e.g. someone deactivated by the FieldRoutes sync). */
export async function sendPendingDriverNotices(admin) {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data } = await admin.from('driver_events').select('id').is('emailed_at', null).lt('attempts', 3).gte('created_at', since).order('created_at');
  let sent = 0;
  for (const e of data || []) if ((await sendDriverEvent(admin, e.id)).ok) sent += 1;
  return { driverEmails: sent };
}
