/**
 * Employee Availability Form (change 55): shared by the form, the email to Ally and the person page.
 * days: { [weekday]: { a: { kind: 'all' | 'hours' | 'off', s, e }, b: same or null } }   b = every other week
 */
import { clock } from './labels';

export const FORM_DAYS = [1, 2, 3, 4, 5, 6];   // Monday – Saturday, like the paper form
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "All day" = the company's hours for that day. Office: 8:30 AM – 5 PM. */
export const ALL_DAY = { s: '08:30', e: '17:00' };

export function slotText(x) {
  if (!x) return '';
  if (x.kind === 'all') return 'All day';
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
