export const RANK = { team_member: 1, lead: 2, manager: 3, c_suite: 4, president: 5 };
export const LEVELS = ['team_member', 'lead', 'manager', 'c_suite', 'president'];

export const LEVEL_LABEL = {
  team_member: 'Team member',
  lead: 'Lead',
  manager: 'Manager',
  c_suite: 'C-Suite',
  president: 'President',
};
export const DEPT_LABEL = { technician: 'Technician', sales: 'Sales', administrative: 'Office' };
export const OFFICES = [
  { key: 'east', name: 'Atlanta East' },
  { key: 'west', name: 'Atlanta West' },
  { key: 'south', name: 'Atlanta South' },
];
export const OFFICE_NAME = Object.fromEntries(OFFICES.map((o) => [o.key, o.name]));
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Title shown under a name: "Technician Lead", or just "President" for the top levels. */
export function roleTitle(department, level) {
  if (level === 'c_suite' || level === 'president') return LEVEL_LABEL[level];
  return `${DEPT_LABEL[department] || ''} ${LEVEL_LABEL[level] || ''}`.trim();
}

/** Levels someone can hand out: below their own (C-Suite can give C-Suite; President anything). */
export function levelOptions(myLevel) {
  if (myLevel === 'president') return LEVELS;
  if (myLevel === 'c_suite') return LEVELS.slice(0, 4);
  return LEVELS.slice(0, Math.max(1, RANK[myLevel] - 1));
}

/** "2026-11-14" → "Nov 14" without time-zone shifts. */
export function shortDate(ymd) {
  if (!ymd) return '';
  return new Date(`${String(ymd).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "09:00:00" → "9 AM" */
export function clock(t) {
  const [h, m] = String(t).split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

function minutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

/** "2 hours", "1.5 hours", "45 minutes" between two "HH:MM" times. */
export function hoursBetween(from, to) {
  const mins = minutes(to) - minutes(from);
  if (mins < 60) return `${mins} minutes`;
  const h = Math.round((mins / 60) * 100) / 100;
  return `${h} hour${h === 1 ? '' : 's'}`;
}

/** When a time-off request is: "Nov 20, 1 PM – 3 PM (2 hours)" or "Nov 20 to Nov 22 (3 days)". */
export function timeOffWhen(r) {
  if (r.start_time && r.end_time) {
    return `${shortDate(r.start_date)}, ${clock(r.start_time)} – ${clock(r.end_time)} (${hoursBetween(r.start_time, r.end_time)})`;
  }
  const n = Math.round((new Date(`${r.end_date}T12:00:00`) - new Date(`${r.start_date}T12:00:00`)) / 864e5) + 1;
  const range = `${shortDate(r.start_date)}${r.end_date !== r.start_date ? ` to ${shortDate(r.end_date)}` : ''}`;
  return `${range} (${n} day${n === 1 ? '' : 's'})`;
}
