/**
 * Every-other-week schedules (change 54). A person who alternates has a_week (the Monday of a "week A") in
 * schedule_rotations, and their week-B hours for the days that differ in schedule_alt (both times empty = off).
 * Weeks an even number of weeks from a_week use the usual schedules rows; the others use schedule_alt where set.
 */

const ms = (ymd) => Date.parse(`${String(ymd).slice(0, 10)}T12:00:00Z`);
/** Monday of the week holding ymd, as YYYY-MM-DD. */
export function mondayOf(ymd) {
  const d = new Date(ms(ymd));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** True when ymd falls in a B week for someone whose week A starts on aWeek (null = doesn't alternate). */
export function isBWeek(aWeek, ymd) {
  if (!aWeek) return false;
  const weeks = Math.round((ms(mondayOf(ymd)) - ms(mondayOf(aWeek))) / (7 * 864e5));
  return Math.abs(weeks) % 2 === 1;
}

/**
 * The hours someone usually works on a date, as [startMin, endMin] or undefined.
 * regular: { weekday: [a, b] }, alt: { weekday: [a, b] | null } (only the days that differ), aWeek: Monday or null.
 */
export function usualShift(regular, alt, aWeek, ymd, weekday) {
  const wd = weekday ?? new Date(ms(ymd)).getUTCDay();
  if (isBWeek(aWeek, ymd) && alt && Object.prototype.hasOwnProperty.call(alt, wd)) return alt[wd] || undefined;
  return regular?.[wd];
}
