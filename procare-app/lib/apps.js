/** The suites in the app, and who sees each one (from the role map). */
export const APPS = {
  technician: { name: 'Technician Performance Card', short: 'Technician', blurb: 'KPIs, incentives and the team leaderboard.', href: '/scorecard', bug: 'spider', tone: 'forest' },
  sales: { name: 'Sales Performance Card', short: 'Sales', blurb: 'Doors, sales and rep standings.', href: '/reps', bug: 'ant', tone: 'lime' },
  wildlife: { name: 'Wildlife', short: 'Wildlife', blurb: 'The wildlife team’s scorecard and exclusion, warranty, trapping and insulation sales.', href: '/wildlife', critter: 'raccoon', tone: 'forest' },
  finance: { name: 'Finance', short: 'Finance', blurb: 'P&L by office and Wildlife from QuickBooks, and marketing cost per customer.', href: '/finance', bug: 'termite', tone: 'lime' },
  operations: { name: 'Operations Performance Card', short: 'Operations', blurb: 'Sales, cancels, job pool, reservice and AR for every office.', href: '/ops', bug: 'termite', tone: 'ink' },
};

/**
 * wildlifeAccess: the person's employees.wildlife_access (change 63), e.g. Jessica, who handles the Wildlife office work.
 * The Wildlife department sees only Wildlife (John, 2026-11-19).
 */
export function appsFor(department, level, wildlifeAccess = false) {
  if (department === 'wildlife') return ['wildlife'];
  if (level === 'c_suite' || level === 'president') return ['technician', 'sales', 'operations', 'wildlife', 'finance'];   // Finance: C-Suite and the President (change 66)
  if (wildlifeAccess) return [...appsFor(department, level), 'wildlife'];
  if (level === 'team_member') return [department === 'administrative' ? 'operations' : department];
  if (department === 'sales') return ['sales', 'operations'];
  if (department === 'technician') return ['technician', 'sales', 'operations'];
  return ['operations', 'technician', 'sales'];                 // office leads and up
}
