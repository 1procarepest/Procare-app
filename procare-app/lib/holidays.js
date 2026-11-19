/**
 * Company holidays (change 57). The company_holidays table holds one on/off switch per holiday; the dates come
 * from the rules here, so they roll forward every year without anyone entering them. A holiday that's on shows as a
 * company day off for everyone, sales reps included (John, 2026-11-19: reps may still choose to work). Dates are the holiday itself (no Friday/Monday
 * "observed" shift when it lands on a weekend).
 */

// nth weekday (0 = Sunday) of a month (1–12); n = -1 means the last one
function nthWeekday(year, month, weekday, n) {
  if (n < 0) {
    const last = new Date(Date.UTC(year, month, 0, 12));
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
    return last.getUTCDate();
  }
  const first = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
// Easter Sunday (Gregorian), as [month, day]
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}
function goodFriday(y) {
  const [m, d] = easter(y);
  const dt = new Date(Date.UTC(y, m - 1, d - 2, 12));
  return dt.toISOString().slice(0, 10);
}
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Every holiday the app knows, in calendar order. date(year) gives that year's YYYY-MM-DD. */
export const HOLIDAYS = [
  { key: 'new_years_day', name: 'New Year’s Day', date: (y) => ymd(y, 1, 1) },
  { key: 'mlk_day', name: 'Martin Luther King Jr. Day', date: (y) => ymd(y, 1, nthWeekday(y, 1, 1, 3)) },
  { key: 'presidents_day', name: 'Presidents’ Day', date: (y) => ymd(y, 2, nthWeekday(y, 2, 1, 3)) },
  { key: 'good_friday', name: 'Good Friday', date: goodFriday },
  { key: 'memorial_day', name: 'Memorial Day', date: (y) => ymd(y, 5, nthWeekday(y, 5, 1, -1)) },
  { key: 'juneteenth', name: 'Juneteenth', date: (y) => ymd(y, 6, 19) },
  { key: 'independence_day', name: 'Independence Day', date: (y) => ymd(y, 7, 4) },
  { key: 'labor_day', name: 'Labor Day', date: (y) => ymd(y, 9, nthWeekday(y, 9, 1, 1)) },
  { key: 'columbus_day', name: 'Columbus Day', date: (y) => ymd(y, 10, nthWeekday(y, 10, 1, 2)) },
  { key: 'veterans_day', name: 'Veterans Day', date: (y) => ymd(y, 11, 11) },
  { key: 'thanksgiving', name: 'Thanksgiving', date: (y) => ymd(y, 11, nthWeekday(y, 11, 4, 4)) },
  { key: 'day_after_thanksgiving', name: 'Day after Thanksgiving', date: (y) => ymd(y, 11, nthWeekday(y, 11, 4, 4) + 1) },
  { key: 'christmas_eve', name: 'Christmas Eve', date: (y) => ymd(y, 12, 24) },
  { key: 'christmas_day', name: 'Christmas Day', date: (y) => ymd(y, 12, 25) },
  { key: 'day_after_christmas', name: 'Day after Christmas', date: (y) => ymd(y, 12, 26) },
  { key: 'new_years_eve', name: 'New Year’s Eve', date: (y) => ymd(y, 12, 31) },
];

/**
 * A lookup for the holidays that are switched on: holidayName(ymd) gives the holiday's name or null.
 * rows: company_holidays rows ({ key, enabled }).
 */
export function holidayLookup(rows) {
  const on = new Set((rows || []).filter((r) => r.enabled).map((r) => r.key));
  const list = HOLIDAYS.filter((h) => on.has(h.key));
  const cache = {};
  return (day) => {
    const y = Number(String(day).slice(0, 4));
    if (!cache[y]) cache[y] = Object.fromEntries(list.map((h) => [h.date(y), h.name]));
    return cache[y][String(day).slice(0, 10)] || null;
  };
}

/** Who gets company holidays off: everyone (sales too since 2026-11-19). One place to change it if that changes. */
export const followsHolidays = () => true;
