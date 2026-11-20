/** The suites in the app, and who sees each one (from the role map). */
export const APPS = {
  technician: { name: 'Technician Performance Card', short: 'Technician', blurb: 'KPIs, incentives and the team leaderboard.', href: '/scorecard', bug: 'spider', tone: 'forest' },
  sales: { name: 'Sales Performance Card', short: 'Sales', blurb: 'Doors, sales and rep standings.', href: '/reps', bug: 'ant', tone: 'lime' },
  wildlife: { name: 'Wildlife', short: 'Wildlife', blurb: 'The wildlife team’s scorecard and exclusion, warranty, trapping and insulation sales.', href: '/wildlife', critter: 'raccoon', tone: 'forest' },
  finance: { name: 'Finance', short: 'Finance', blurb: 'P&L by office and Wildlife from QuickBooks, and marketing cost per customer.', href: '/finance', bug: 'termite', tone: 'lime' },
  ads: { name: 'Ads', short: 'Ads', blurb: 'Google Guaranteed and Google Ads: spend, leads, cost per lead and cost per customer.', href: '/ads', bug: 'cricket', tone: 'ink' },
  operations: { name: 'Operations Performance Card', short: 'Operations', blurb: 'Sales, cancels, job pool, reservice and AR for every office.', href: '/ops', bug: 'termite', tone: 'ink' },
};

/**
 * wildlifeAccess: the person's employees.wildlife_access (change 63), e.g. Jessica, who handles the Wildlife office work.
 * The Wildlife department sees only Wildlife (John, 2026-11-19).
 */
export function appsFor(department, level, wildlifeAccess = false, adsAccess = false) {
  const list = baseApps(department, level, wildlifeAccess);
  // Ads (change 71): C-Suite, the President, and the ad team (employees.ads_access, set in Ads -> Settings)
  return adsAccess && !list.includes('ads') ? [...list, 'ads'] : list;
}

/** Shorthand for an employee record. */
export const appsOf = (me) => appsFor(me.department, me.level, !!me.wildlife_access, !!me.ads_access);

function baseApps(department, level, wildlifeAccess) {
  if (department === 'wildlife') return ['wildlife'];
  if (level === 'c_suite' || level === 'president') return ['technician', 'sales', 'operations', 'wildlife', 'finance', 'ads'];   // Finance: C-Suite and the President (change 66)
  if (wildlifeAccess) return [...baseApps(department, level), 'wildlife'];
  if (level === 'team_member') return [department === 'administrative' ? 'operations' : department];
  if (department === 'sales') return ['sales', 'operations'];
  if (department === 'technician') return ['technician', 'sales', 'operations'];
  return ['operations', 'technician', 'sales'];                 // office leads and up
}
