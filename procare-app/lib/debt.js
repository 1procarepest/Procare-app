// Finance → Debt (change 76): the debt schedule. Truck loans (change 75) + other loans, cards and lines, with balances
// from the QuickBooks balance sheet once each is linked to its account, next to the P&L's net profit.

const n = (x) => (x === null || x === undefined || x === '' ? 0 : Number(x) || 0);

export const KINDS = [
  { key: 'auto', label: 'Auto loans' },
  { key: 'long', label: 'Long term (5+ years)' },
  { key: 'short', label: 'Short term (1–2 years)' },
  { key: 'card', label: 'Credit cards & lines' },
  { key: 'other', label: 'Other' },
];
export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));
const DEBT_GROUPS = new Set(['CreditCards', 'OtherCurrentLiabilities', 'LongTermLiabilities']);

/** Months from `today` (YYYY-MM-DD) to an end date; 0 when past. */
export function monthsLeft(end, today) {
  if (!end) return null;
  const [y1, m1] = today.split('-').map(Number);
  const [y2, m2] = end.split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1));
}

/** Words a QuickBooks account name should contain to be this loan's account (truck #, VIN end, card digits). */
function hints(item) {
  if (item.type === 'truck') return [item.truck_no, item.vin?.slice(-6), item.vin?.slice(-4)].filter((x) => x && String(x).length >= 2);
  const digits = (item.name.match(/\d{4,5}/g) || []);
  return digits.length ? digits : [item.name.replace(/\s+loan$/i, '')];
}
function suggest(item, accounts) {
  const words = hints(item).map((h) => String(h).toLowerCase());
  const found = accounts.filter((a) => {
    const name = `${a.parent || ''} ${a.name}`.toLowerCase();
    return words.some((w) => (/^\d+$/.test(w) ? new RegExp(`(^|\\D)${w}(\\D|$)`).test(name) : name.includes(w)));
  });
  return found.length === 1 ? found[0] : null;
}

/**
 * Everything the page shows. today: YYYY-MM-DD.
 * Returns { items, groups, total, qbo, profit, accounts, unlinked, bsMonth }.
 */
export function buildDebt(data, today) {
  const bsMonth = data?.bs_month || null;
  const accounts = (data?.accounts || []).filter((a) => a.section === 'Liabilities');
  const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const balanceOf = (it) => {
    if (it.qbo_account_id && bsMonth) return { balance: n(byId[it.qbo_account_id]?.amount), source: 'qbo' };
    return { balance: n(it.balance), source: it.balance === null || it.balance === undefined ? 'none' : 'typed' };
  };

  const items = [];
  for (const l of data?.truck_loans || []) {
    if (l.paid_off || l.truck_status === 'sold' || l.truck_status === 'gone') continue;
    items.push({
      type: 'truck', kind: 'auto', id: l.id, truck_no: l.truck_no, vin: l.vin,
      name: `#${l.truck_no || '?'} ${[l.year, l.model].filter(Boolean).join(' ')}`.trim(), lender: l.lender, payment: n(l.payment),
      rate: l.rate, end_on: l.end_on, start_on: l.start_on, original: l.financed, balance: l.balance, balance_on: l.balance_on,
      qbo_account_id: l.qbo_account_id, qbo_account_name: l.qbo_account_name, for_sale: l.truck_status === 'for_sale',
    });
  }
  for (const d of data?.debts || []) {
    if (!d.active) continue;
    items.push({ ...d, type: 'debt', payment: n(d.payment) });
  }
  for (const it of items) {
    Object.assign(it, balanceOf(it));
    it.left = monthsLeft(it.end_on, today);
    it.suggested = !it.qbo_account_id && bsMonth ? suggest(it, accounts) : null;
  }

  const groups = KINDS.map((k) => {
    const list = items.filter((i) => i.kind === k.key);
    return { ...k, list, payment: list.reduce((s, i) => s + i.payment, 0), balance: list.reduce((s, i) => s + i.balance, 0),
      limit: list.reduce((s, i) => s + n(i.credit_limit), 0) };
  }).filter((g) => g.list.length);
  const total = { payment: groups.reduce((s, g) => s + g.payment, 0), balance: groups.reduce((s, g) => s + g.balance, 0) };

  // QuickBooks debt that isn't on the schedule yet (so the totals can be checked against the books)
  const linked = new Set(items.map((i) => i.qbo_account_id).filter(Boolean));
  const debtAccounts = accounts.filter((a) => DEBT_GROUPS.has(a.grp));
  const unlinked = debtAccounts.filter((a) => !linked.has(a.id) && Math.abs(n(a.amount)) >= 1);
  const qboTotal = bsMonth ? debtAccounts.reduce((s, a) => s + n(a.amount), 0) : null;

  // Net profit: the last 12 full months from the P&L (this month isn't finished)
  const thisMonth = `${today.slice(0, 7)}-01`;
  const months = (data?.profit || []).filter((p) => p.month < thisMonth).slice(-12);
  const avgNet = months.length ? months.reduce((s, p) => s + n(p.net), 0) / months.length : null;
  const avgInterest = months.length ? months.reduce((s, p) => s + n(p.interest), 0) / months.length : null;
  const lastMonth = months[months.length - 1] || null;
  const profit = {
    months: months.length, avgNet, avgInterest, last: lastMonth,
    share: avgNet && avgNet > 0 ? total.payment / avgNet : null,
    lastShare: lastMonth && n(lastMonth.net) > 0 ? total.payment / n(lastMonth.net) : null,
  };

  return { items, groups, total, qboTotal, unlinked, accounts: debtAccounts, profit, bsMonth };
}
