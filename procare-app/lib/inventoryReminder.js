// Change 85: the monthly inventory count is due the last week of the month. On the last 2 business days (Mon–Fri, not
// a company holiday that's switched on), each place whose count isn't finished gets an email to its region's branch
// managers (technician managers there; the President if none). Wildlife's count at West goes to the wildlife manager.
// Switch: inventory_count_reminder (Settings → Email settings).
import { sendEmail } from './email';
import { holidayLookup } from './holidays';
import { OFFICE_NAME } from './labels';
import { monthLabel } from './inventory';

/** The month's business days, YYYY-MM-DD. isHoliday(ymd) → truthy for a company holiday. */
export function businessDays(ymd, isHoliday = () => false) {
  const [y, m] = ymd.split('-').map(Number);
  const out = [];
  for (let d = 1; d <= 31; d += 1) {
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCMonth() !== m - 1) break;
    const day = t.toISOString().slice(0, 10);
    if (t.getUTCDay() !== 0 && t.getUTCDay() !== 6 && !isHoliday(day)) out.push(day);
  }
  return out;
}

/** 2 = second-to-last business day, 1 = the last one, 0 = not a reminder day. */
export function reminderDay(today, isHoliday) {
  const days = businessDays(today, isHoliday);
  const k = days.indexOf(today);
  const fromEnd = days.length - k;
  return k >= 0 && fromEnd <= 2 ? fromEnd : 0;
}

export async function sendInventoryReminders(admin, today, origin) {
  const { data: sw } = await admin.from('notification_settings').select('enabled').eq('key', 'inventory_count_reminder').maybeSingle();
  if (!sw?.enabled) return { inventoryEmails: 0 };
  const { data: hol } = await admin.from('company_holidays').select('key, enabled');
  const isHoliday = holidayLookup(hol);
  const left = reminderDay(today, isHoliday);
  if (!left) return { inventoryEmails: 0 };
  const lastDay = businessDays(today, isHoliday).pop();
  const lastName = new Date(`${lastDay}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const month = `${today.slice(0, 7)}-01`;
  const [{ data: places }, { data: counts }, { data: people }] = await Promise.all([
    admin.from('inventory_locations').select('key, name, office, has_wildlife').eq('active', true),
    admin.from('inventory_counts').select('location, section, status').eq('month', month),
    admin.from('employees').select('first_name, email, department, level, office, manages_wildlife').eq('active', true),
  ]);
  const presidents = (people || []).filter((p) => p.level === 'president');
  const status = (loc, section) => (counts || []).find((c) => c.location === loc && c.section === section)?.status || null;
  const when = left === 1 ? 'today, the last business day of the month' : `by ${lastName}, the last business day of the month`;
  let sent = 0;
  const send = async (who, place, section, st) => {
    const to = (who.length ? who : presidents).map((p) => p.email).filter(Boolean);
    if (!to.length) return;
    const what = section === 'wildlife' ? `the Wildlife count at ${place.name}` : `the ${place.name} inventory count`;
    const r = await sendEmail({
      to,
      subject: `${left === 1 ? 'Due today' : `Due ${lastName.split(',')[0]}`}: ${monthLabel(month, true)} inventory count, ${section === 'wildlife' ? 'Wildlife' : place.name}`,
      heading: `${monthLabel(month, true)} inventory count isn’t finished`,
      lines: [
        `${st === 'draft' ? 'It’s started but not finished' : 'It hasn’t been started'}: ${what} is due ${when}.`,
        'Counts are done the last week of every month. Open Inventory, count each item, then tap “Finish the count”.',
      ],
      link: { href: `${origin}/${section === 'wildlife' ? 'wildlife' : 'ops'}/inventory`, label: 'Open the count' },
    });
    if (r.ok) sent += 1;
  };
  for (const place of places || []) {
    const st = status(place.key, 'pest');
    if (st !== 'done') {
      await send((people || []).filter((p) => p.department === 'technician' && p.level === 'manager' && place.office && p.office === place.office), place, 'pest', st);
    }
    if (place.has_wildlife && status(place.key, 'wildlife') !== 'done') {
      await send((people || []).filter((p) => p.manages_wildlife), place, 'wildlife', status(place.key, 'wildlife'));
    }
  }
  return { inventoryEmails: sent };
}
