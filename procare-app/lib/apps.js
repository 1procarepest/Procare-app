/** The suites in the app, and who sees each one (from the role map). */
export const APPS = {
  technician: { name: 'Technician scorecard', blurb: 'KPIs, incentives and the team leaderboard.', href: '/scorecard', bug: 'spider', tone: 'forest' },
  sales: { name: 'Sales rep cards', blurb: 'Doors, sales and rep standings.', href: '/reps', bug: 'ant', tone: 'lime' },
  operations: { name: 'Operations suite', blurb: 'Sales, cancels, job pool, reservice and AR for every office.', href: '/ops', bug: 'termite', tone: 'ink' },
};

export function appsFor(department, level) {
  if (level === 'c_suite' || level === 'president') return ['technician', 'sales', 'operations'];
  if (level === 'team_member') return [department === 'administrative' ? 'operations' : department];
  if (department === 'sales') return ['sales', 'operations'];
  if (department === 'technician') return ['technician', 'sales', 'operations'];
  return ['operations', 'technician'];
}
