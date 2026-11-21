/**
 * Reviews (employee_reviews). Three kinds:
 *  * 'green' (change 60): rated on Procare's G.R.E.E.N. values, 1 to 5, plus notes.
 *  * 'checkin' and 'yearly' (change 73, Ally's "HR who cares" forms in Forms): written answers to the questions below,
 *    saved in employee_reviews.answers by key. Changing a question's wording is fine; keep its key.
 */
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

export const REVIEW_KIND = {
  green: { label: 'G.R.E.E.N. ratings', short: 'review' },
  checkin: { label: '6 Month Check-In', short: '6-month check-in' },
  yearly: { label: 'Yearly Review', short: 'yearly review' },
};

// Ally's 6-month check-in (2026-11-20). `rides`: show the person's last ride-along feedback above this one.
export const CHECKIN = [
  { key: 'comfortable', q: 'What do you feel most comfortable with in service and customer service?' },
  { key: 'improve', q: 'What do you think you need to improve?' },
  { key: 'stewardship', q: 'How are you being a steward over your schedule and company-issued equipment? Anything you feel needs to be replaced?' },
  { key: 'support', q: 'Is there anything management can do to support you at this halfway point?' },
  { key: 'rides', q: 'Go over the last couple of ride-alongs together. Notes:', rides: true },
  { key: 'collaboration', q: 'How is collaboration with your team going? What could we do to work more effectively together?' },
  { key: 'feedback', q: 'Any feedback you want to share?' },
];

// Ally's yearly review questions (2026-11-20)
export const YEARLY = [
  { key: 'crushed', q: 'What’s your “I crushed that!” moment from this year, and have we celebrated it enough?' },
  { key: 'title', q: 'If your year at work had a title, what would it be, and why?' },
  { key: 'energy', q: 'What kind of work gave you energy, and what had you watching the clock?' },
  { key: 'unnoticed', q: 'What’s one thing you accomplished that I or your team might not have noticed, but absolutely should know about?' },
  { key: 'notplanned', q: 'What was your biggest “well, that didn’t go as planned” moment, and what did you take away from it?' },
  { key: 'magic', q: 'If you could wave a magic wand and change one thing about your day-to-day work, what would it be?' },
  { key: 'supported', q: 'Where did you feel supported this year, and where did you need more from me or your manager?' },
  { key: 'next', q: 'What’s a skill or project you’d love to tackle next year if we could make room for it?' },
  { key: 'recognized', q: 'How do you like to be recognized when you do great work: a public shout-out, a private thank-you, or something else?' },
  { key: 'goodyear', q: 'Fast-forward to next year’s review: what would make you say “That was a really good year,” and how can I help you get there?' },
  { key: 'wand', q: 'If you had the tech or office magic wand next year, what would you improve to help us cut costs or grow revenue, and what support would you need to make it happen?' },
];

export const QUESTIONS = { checkin: CHECKIN, yearly: YEARLY };
