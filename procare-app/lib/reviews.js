/** Year reviews (change 60): rated on Procare's G.R.E.E.N. values, 1 to 5, plus notes. */
export const VALUES = [
  { key: 'growth', letter: 'G', name: 'Growth Mindset', hint: 'Grows their skills and helps others grow.' },
  { key: 'relationships', letter: 'R', name: 'Relationships Matter', hint: 'Treats customers and teammates the way they want to be treated.' },
  { key: 'grind', letter: 'E', name: 'Embrace the Grind', hint: 'Stays positive, improves and does the hard parts well.' },
  { key: 'ownership', letter: 'E', name: 'Extreme Ownership', hint: 'Owns their job as if they were the owner.' },
  { key: 'stewardship', letter: 'N', name: 'Nurture Stewardship', hint: 'Takes care of equipment, products, property and the environment.' },
];
export const SCALE = { 1: 'Needs work', 2: 'Below', 3: 'Meets', 4: 'Strong', 5: 'Outstanding' };

/** Average of the ratings given, to one decimal (null if none). */
export function average(ratings) {
  const v = VALUES.map((x) => Number(ratings?.[x.key])).filter((n) => n >= 1 && n <= 5);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
