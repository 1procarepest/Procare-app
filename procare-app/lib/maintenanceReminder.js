// Change 82: Monday mornings, each office's branch managers (technician managers there; the President if none) get the
// trucks whose oil change is due or overdue. Switch: oil_change_reminder (Settings → Email settings).
import { sendEmail } from './email';
import { OFFICE_NAME } from './labels';
import { buildMaintenance } from './maintenance';
import { usDate } from './trucks';

export async function sendOilReminders(admin, today, origin) {
  const { data: sw } = await admin.from('notification_settings').select('enabled').eq('key', 'oil_change_reminder').maybeSingle();
  if (!sw?.enabled) return { oilEmails: 0 };
  const [{ data: trucks }, { data: rules }, { data: oils }, { data: people }] = await Promise.all([
    admin.from('trucks').select('id, truck_no, year, make, model, office, driver_id, driver_note, mileage, mileage_on, odometer, odometer_at').in('status', ['active', 'for_sale']),
    admin.from('fleet_settings').select('oil_every_miles, oil_every_months').eq('id', 1).maybeSingle(),
    admin.from('truck_log').select('truck_id, day, miles, created_at').eq('kind', 'maintenance').eq('service', 'oil').order('day', { ascending: false }),
    admin.from('employees').select('id, first_name, last_name, email, department, level, office, active').eq('active', true),
  ]);
  const lastOil = {};
  for (const o of oils || []) if (!lastOil[o.truck_id]) lastOil[o.truck_id] = o;
  const name = Object.fromEntries((people || []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const m = buildMaintenance({
    rules: { miles: rules?.oil_every_miles || 5000, months: rules?.oil_every_months || 6 },
    trucks: (trucks || []).map((t) => ({ ...t, driver: name[t.driver_id] || null, last_oil: lastOil[t.id] || null })),
  }, today);
  const due = m.trucks.filter((t) => t.oil.status === 'overdue' || t.oil.status === 'soon');
  const presidents = (people || []).filter((p) => p.level === 'president');
  let sent = 0;
  for (const office of Object.keys(OFFICE_NAME)) {
    const list = due.filter((t) => t.office === office);
    if (!list.length) continue;
    const managers = (people || []).filter((p) => p.department === 'technician' && p.level === 'manager' && p.office === office);
    const to = (managers.length ? managers : presidents).map((p) => p.email).filter(Boolean);
    const lines = list.map((t) => {
      const o = t.oil;
      const how = o.left !== null && o.left <= 0 ? `${(-o.left).toLocaleString('en-US')} miles past due`
        : o.daysLeft <= 0 ? `due since ${usDate(o.dueOn)}`
        : o.left !== null && o.left <= 500 ? `due in ${o.left.toLocaleString('en-US')} miles` : `due by ${usDate(o.dueOn)}`;
      return `Truck ${t.truck_no || '?'} (${t.driver || t.driver_note || 'no driver'}): ${o.status === 'overdue' ? 'OVERDUE, ' : ''}${how}`;
    });
    const r = await sendEmail({
      to,
      subject: `Oil changes due: ${OFFICE_NAME[office]} (${list.length} truck${list.length > 1 ? 's' : ''})`,
      heading: `Oil changes due in ${OFFICE_NAME[office]}`,
      lines: [...lines, `Rule: every ${m.rules.miles.toLocaleString('en-US')} miles or ${m.rules.months} months. Log it on the Maintenance page once it’s done.`],
      link: { href: `${origin}/ops/maintenance`, label: 'Open maintenance' },
    });
    if (r.ok) sent += 1;
  }
  return { oilEmails: sent };
}
