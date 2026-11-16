/**
 * Ride-alongs and follow-behinds (change 47, BONUSES.md): the questions, the guided rating scales John wrote,
 * and how a saved report reads back (report page and the email to Ryan). Answers are saved in
 * field_reports.answers under these keys; the Where to improve switches and the note to the tech are separate
 * columns because the tech sees those.
 */

export const KIND_LABEL = { ride_along: 'Ride-along', follow_behind: 'Follow-behind' };

export const SKILLS = [
  { key: 'pest', label: 'Pest knowledge' },
  { key: 'product', label: 'Product knowledge' },
  { key: 'upsell', label: 'Upsell ability' },
  { key: 'retention', label: 'Retention ability' },
  { key: 'time', label: 'Time management' },
  { key: 'customer', label: 'Customer interaction' },
  { key: 'body', label: 'Body language' },
  { key: 'organized', label: 'Organized and professional' },
];
export const SKILL_LABEL = Object.fromEntries(SKILLS.map((s) => [s.key, s.label]));

export const YES_NO = [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }];

// ---------- Ride-along (one per day) ----------
export const RIDE_SERVICE = [
  { key: 'knock', q: 'Did the tech knock on the door or make any attempt to contact the customer?' },
  { key: 'hanger', q: 'At the end of the service, did the tech leave a door hanger or contact the customer?' },
  { key: 'gps', q: 'Did the tech properly treat for a GPS?' },
  { key: 'tbs', q: 'Did the tech properly service a TBS?' },
  { key: 'slip', q: 'Did the tech fill out the service slip properly?' },
];
export const RIDE_UPSELL = [
  { v: 'yes', label: 'Yes' },
  { v: 'no', label: 'No' },
  { v: 'none', label: 'Didn’t get the chance (nobody home)' },
];
export const INTERIOR = [{ v: 'good', label: 'Good' }, { v: 'attention', label: 'Needs attention' }];
export const CLEAN = [
  { v: 1, emoji: '🗑️', label: 'Messy', hint: 'Something may be living in here.' },
  { v: 2, emoji: '🍟', label: 'Lived-in', hint: 'A few fries from last Tuesday.' },
  { v: 3, emoji: '🧹', label: 'Fairly clean', hint: 'A quick vacuum away.' },
  { v: 4, emoji: '✨', label: 'Clean', hint: 'Ready for a customer to look inside.' },
  { v: 5, emoji: '🏆', label: 'Your mother would be proud', hint: 'Spotless. Frame-worthy.' },
];
export const LIGHTS = ['Oil change', 'Tire pressure', 'Check engine'];
export const IMPROVE_HINT = 'What should this tech focus on next? Give one or two specific things they can practice before the next ride-along.';

// ---------- Follow-behind (one per visit) ----------
export const COMMS = [
  { v: 'before', label: 'Just before' },
  { v: 'after', label: 'Just after' },
  { v: 'both', label: 'Both' },
  { v: 'neither', label: 'Neither' },
];
export const EXPERIENCE = [
  { v: 1, emoji: '😠', label: 'Upset', hint: 'Talking about canceling.' },
  { v: 2, emoji: '😕', label: 'Let down', hint: 'Expected a superhero, got a sidekick.' },
  { v: 3, emoji: '😐', label: 'Fine', hint: 'No complaints, no compliments.' },
  { v: 4, emoji: '🙂', label: 'Happy', hint: 'Pleased and would recommend us.' },
  { v: 5, emoji: '🤩', label: 'Raving fan', hint: 'Might invite the tech to Thanksgiving.' },
];
export const IMPRESSION = [
  { v: 1, label: 'Not a fan', hint: 'Would rather see a different tech next time.' },
  { v: 2, label: 'Something was off', hint: 'Seemed rushed, quiet or late.' },
  { v: 3, label: 'Polite', hint: 'Friendly enough and got the job done.' },
  { v: 4, label: 'Impressed', hint: 'Explained what they did and answered questions.' },
  { v: 5, label: 'Their favorite', hint: 'Knows the tech by name and asks for them.' },
];
export const WEBS = [
  { v: 1, emoji: '🕸️', label: 'Haunted house', hint: 'No Halloween decorations needed.' },
  { v: 2, label: 'Missed spots', hint: 'Webs left at several eaves, windows or doors.' },
  { v: 3, label: 'Mostly clear', hint: 'A few stragglers.' },
  { v: 4, label: 'Clean', hint: 'Swept everywhere that matters.' },
  { v: 5, label: 'Charlotte moved out', hint: 'Not a web in sight.', aside: '(A nod to Charlotte’s Web)' },
];
export const TERMITE = [
  { v: 1, label: 'Poor job', hint: 'Missing, damaged or clearly not checked.' },
  { v: 2, label: 'Neglected', hint: 'Overgrown, hard to find or lids loose.' },
  { v: 3, label: 'Okay', hint: 'Checked, but could be tidier.' },
  { v: 4, label: 'Good', hint: 'Clean, easy to find, lids secure.' },
  { v: 5, label: 'Textbook', hint: 'Belongs in the training manual.' },
];
export const FB_UPSELL = [{ v: 'taken', label: 'Taken' }, { v: 'missed', label: 'Missed' }, { v: 'none', label: 'No opportunity' }];
export const FB_AUTOPAY = [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }, { v: 'already', label: 'Already on auto-pay' }];

/** Upset or Let down: the branch managers get an alert. */
export const lowScore = (answers) => Number(answers?.experience) > 0 && Number(answers.experience) <= 2;

/** Truck items that need fixing, from a ride-along's answers. */
export function truckItems(a) {
  const out = (a?.lights || []).filter((l) => LIGHTS.includes(l)).map((l) => `${l} light on`);
  if (a?.other_light && String(a.other_light).trim()) out.push(`Warning light: ${String(a.other_light).trim()}`);
  if (a?.interior === 'attention') out.push('Interior needs attention');
  return out;
}

const pick = (list, v) => list.find((x) => String(x.v) === String(v));
const scaleText = (list, v) => {
  const x = pick(list, v);
  return x ? `${v} of 5 · ${x.emoji ? `${x.emoji} ` : ''}${x.label}` : '–';
};
const choice = (list, v) => pick(list, v)?.label || '–';

/** The answers as [question, answer] pairs, in form order (manager-only view and Ryan's email). */
export function answerLines(kind, a = {}) {
  if (kind === 'ride_along') {
    return [
      ...RIDE_SERVICE.map((q) => [q.q, choice(YES_NO, a[q.key])]),
      ['Was the tech able to upsell?', choice(RIDE_UPSELL, a.upsell)],
      ['Truck interior', choice(INTERIOR, a.interior)],
      ['Truck cleanliness', scaleText(CLEAN, a.clean)],
      ['Dash warning lights', [...(a.lights || []), ...(a.other_light ? [a.other_light] : [])].join(', ') || 'None'],
      ['Summary of the day', a.summary || '–'],
    ];
  }
  return [
    ['Talking with the person on the account?', choice(YES_NO, a.on_account)],
    ['Communicated with before and after service', choice(COMMS, a.comms)],
    ['Customer’s overall experience', scaleText(EXPERIENCE, a.experience)],
    ['Customer’s impression of the tech', scaleText(IMPRESSION, a.impression)],
    ['Webs (pest service)', scaleText(WEBS, a.webs)],
    ...(a.termite ? [['Termite stations', scaleText(TERMITE, a.termite)], ['Why that rating?', a.termite_why || '–']] : []),
    ['Upsell opportunity', `${choice(FB_UPSELL, a.upsell)}${a.upsell_note ? ` · ${a.upsell_note}` : ''}`],
    ['Auto-pay collected', choice(FB_AUTOPAY, a.autopay)],
    ['Customer positive feedback', a.positive || '–'],
    ['Customer negative feedback', a.negative || '–'],
    ['Anything the customer would like to see improved', a.wish || '–'],
  ];
}

/** What's still missing before a report can be sent (empty = ready). */
export function missing(kind, f) {
  const a = f.answers || {};
  const out = [];
  if (!f.tech_id) out.push('the technician');
  if (kind === 'ride_along') {
    RIDE_SERVICE.forEach((q) => { if (!a[q.key]) out.push(`“${q.q}”`); });
    if (!a.upsell) out.push('the upsell question');
    if (!a.interior) out.push('the truck interior');
    if (!a.clean) out.push('truck cleanliness');
    if (!a.lights_checked) out.push('dash warning lights (pick None if there aren’t any)');
  } else {
    if (!f.appointment_id) out.push('the customer');
    if (!a.experience) out.push('overall experience');
    if (!a.impression) out.push('impression of the tech');
    if (!a.webs) out.push('webs');
    if (f.termite && !a.termite) out.push('termite stations');
    if (!a.upsell) out.push('upsell');
    if (!a.autopay) out.push('auto-pay');
    if (!String(a.positive || '').trim()) out.push('positive feedback');
    if (!String(a.negative || '').trim()) out.push('negative feedback');
  }
  return out;
}
