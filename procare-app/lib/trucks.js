// Operations → Trucks (change 75): the truck sheet. Shared by the page and the add / sold emails.

const n = (x) => (x === null || x === undefined || x === '' ? 0 : Number(x) || 0);

export const STATUS = {
  active: { label: 'On the road', tone: 'good' },
  for_sale: { label: 'For sale', tone: 'warn' },
  sold: { label: 'Sold', tone: 'muted' },
  gone: { label: 'Off the fleet', tone: 'muted' },
};
export const ON_SHEET = (t) => t.status === 'active' || t.status === 'for_sale';

export const LOG_KIND = {
  note: 'Note', maintenance: 'Maintenance', added: 'Added', removed: 'Off the fleet', for_sale: 'For sale', moved: 'Moved', driver: 'Driver',
};

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2022 Toyota Tacoma" */
export function truckName(t) {
  return [t.year, t.make, t.model].filter(Boolean).join(' ') || 'Vehicle';
}

/** 2026-11-20 → 11/20/2026 */
export function usDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).slice(0, 10).split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
}

/** $21,000 (cents = $21,000.00) */
export function dollars(x, cents = false) {
  if (x === null || x === undefined || x === '') return '–';
  const v = n(x);
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
}

/** The loan still being paid on a truck (the newest one not paid off), or null. */
export function openLoan(t) {
  const list = (t.loans || []).filter((l) => !l.paid_off && n(l.balance) > 0);
  return list.length ? list[list.length - 1] : null;
}

/** Months left on a loan from today (0 when past the end). */
export function monthsLeft(loan, today) {
  if (!loan?.end_on) return null;
  const [y1, m1] = today.split('-').map(Number);
  const [y2, m2] = loan.end_on.split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1));
}

/** Totals for the tiles: trucks per office, for sale, and (money) payments, balances, value, equity. */
export function fleetTotals(trucks) {
  const on = trucks.filter(ON_SHEET);
  const byOffice = {};
  for (const t of on) byOffice[t.office || 'none'] = (byOffice[t.office || 'none'] || 0) + 1;
  let payments = 0, balance = 0, value = 0, valued = 0, insurance = 0;
  for (const t of on) {
    const l = openLoan(t);
    if (l) { payments += n(l.payment); balance += n(l.balance); }
    if (t.value !== null && t.value !== undefined) { value += n(t.value); valued += 1; }
    insurance += n(t.insurance_yearly);
  }
  return {
    count: on.length,
    forSale: on.filter((t) => t.status === 'for_sale').length,
    noDriver: on.filter((t) => t.status === 'active' && !t.driver_id).length,
    byOffice, payments, balance, value, valued, equity: value - balance, insurance,
  };
}

/** Truck documents (change 77). `bookkeeper`: sent to the bookkeeper with the added / sold email. */
export const DOC_KIND = {
  purchase: { label: 'Purchase agreement', when: 'added' },
  finance: { label: 'Finance agreement', when: 'added' },
  title: { label: 'Title', when: null },
  bill_of_sale: { label: 'Bill of sale', when: 'removed' },
  other: { label: 'Other', when: null },
};
