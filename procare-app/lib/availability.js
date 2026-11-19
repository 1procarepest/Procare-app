/**
 * Availability Form (change 55; contractors' version for sales): shared by the form, the email to Ally and the person page.
 * days: { [weekday]: { a: { kind: 'hours' | 'off', s, e }, b: same or null } }   a = this week, b = the other week
 */
import { clock } from './labels';

export const FORM_DAYS = [1, 2, 3, 4, 5, 6];   // Monday – Saturday, like the paper form
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Hours a day starts with on the form, by department (people change them). Technicians: at the first stop by
 * 9 AM and available until 6 PM; office: 8:30 AM – 5 PM. */
export const DEFAULT_HOURS = { technician: { s: '09:00', e: '18:00' }, administrative: { s: '08:30', e: '17:00' }, sales: { s: '09:00', e: '17:00' } };
/** Forms sent before 2026-11-18 could say "All day": office hours. */
const ALL_DAY = { s: '08:30', e: '17:00' };

/** Sales reps are contractors, not employees: every word on their form says so. */
export const formWords = (isSales) => (isSales
  ? { title: 'Contractor availability form', who: 'Contractor', file: 'contractor file', sign: 'Contractor signature' }
  : { title: 'Employee availability form', who: 'Employee', file: 'employee file', sign: 'Employee signature' });

export function slotText(x) {
  if (!x) return '';
  if (x.kind === 'all') return 'All day';   // older forms
  if (x.kind === 'off') return 'Not available';
  return x.s && x.e ? `${clock(x.s)} – ${clock(x.e)}` : 'Hours not filled in';
}

/** "Monday: All day" or "Thursday: 8:45 AM – 12:45 PM / every other week: 1 PM – 5 PM" */
export function dayLine(days, wd) {
  const d = days?.[wd];
  if (!d?.a) return `${DAY_FULL[wd]}: (blank)`;
  return `${DAY_FULL[wd]}: ${slotText(d.a)}${d.b ? `  ·  every other week: ${slotText(d.b)}` : ''}`;
}

/** Start/end for the schedule editor, or null for off. */
export function slotHours(x) {
  if (!x || x.kind === 'off') return null;
  if (x.kind === 'all') return ALL_DAY;
  return x.s && x.e ? { s: x.s, e: x.e } : null;
}
