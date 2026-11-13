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
