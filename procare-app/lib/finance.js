/**
 * Finance (change 66): P&L by QuickBooks class (each office, Wildlife) and marketing cost per customer.
 * Amounts come from qbo_pl_monthly (QuickBooks, whole months); new customers by lead source from FieldRoutes.
 */
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export const PERIODS = [
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'lastQuarter', label: 'Last quarter' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'lastYear', label: 'Last year' },
];

/** { from, to, label } for a period key, in Atlanta's calendar (today = YYYY-MM-DD). */
export function financeRange(key, today) {
  const [y, m] = today.split('-').map(Number);
  const q = Math.floor((m - 1) / 3);
  const month = (yy, mm) => ({ from: ymd(yy, mm, 1), to: ymd(yy, mm, lastDay(yy, mm)) });
  switch (key) {
    case 'lastMonth': return m === 1 ? month(y - 1, 12) : month(y, m - 1);
    case 'thisQuarter': return { from: ymd(y, q * 3 + 1, 1), to: ymd(y, q * 3 + 3, lastDay(y, q * 3 + 3)) };
    case 'lastQuarter': {
      const yy = q === 0 ? y - 1 : y;
      const qq = q === 0 ? 3 : q - 1;
      return { from: ymd(yy, qq * 3 + 1, 1), to: ymd(yy, qq * 3 + 3, lastDay(yy, qq * 3 + 3)) };
    }
    case 'ytd': return { from: ymd(y, 1, 1), to: today };
    case 'lastYear': return { from: ymd(y - 1, 1, 1), to: ymd(y - 1, 12, 31) };
    default: return month(y, m);
  }
}

export const SECTIONS = ['Income', 'Cost of Goods Sold', 'Expenses', 'Other Income', 'Other Expenses'];
const isWildlife = (c) => /wildlife/i.test(c);

/** Class columns: offices A–Z, then Wildlife, then Not specified (QuickBooks' "no class"). */
export function classOrder(classes) {
  const rank = (c) => (c === 'Not specified' ? 2 : isWildlife(c) ? 1 : 0);
  return [...new Set(classes)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const n = (x) => Number(x) || 0;

/**
 * finance_data().pl → { classes, sections: { [section]: { accounts: [{ name, parent, by: {class: amt}, total }], by, total } },
 *   totals: { income, cogs, gross, expenses, operating, otherIncome, otherExpenses, net } each { by: {class: amt}, total } }
 */
export function buildPl(pl) {
  const classes = classOrder((pl || []).map((r) => r.class));
  const sections = Object.fromEntries(SECTIONS.map((s) => [s, { accounts: {}, by: {}, total: 0 }]));
  (pl || []).forEach((r) => {
    const s = sections[r.section];
    if (!s) return;
    const key = `${r.parent_name || ''}|${r.account_name}`;
    const a = (s.accounts[key] ||= { name: r.account_name, parent: r.parent_name, by: {}, total: 0 });
    a.by[r.class] = n(a.by[r.class]) + n(r.amount);
    a.total += n(r.amount);
    s.by[r.class] = n(s.by[r.class]) + n(r.amount);
    s.total += n(r.amount);
  });
  Object.values(sections).forEach((s) => {
    s.accounts = Object.values(s.accounts).sort((x, y) => (x.parent || x.name).localeCompare(y.parent || y.name) || x.name.localeCompare(y.name));
  });
  const combo = (parts) => {
    const by = {};
    classes.forEach((c) => { by[c] = parts.reduce((t, [sec, sign]) => t + sign * n(sections[sec].by[c]), 0); });
    return { by, total: parts.reduce((t, [sec, sign]) => t + sign * sections[sec].total, 0) };
  };
  const totals = {
    gross: combo([['Income', 1], ['Cost of Goods Sold', -1]]),
    operating: combo([['Income', 1], ['Cost of Goods Sold', -1], ['Expenses', -1]]),
    net: combo([['Income', 1], ['Cost of Goods Sold', -1], ['Expenses', -1], ['Other Income', 1], ['Other Expenses', -1]]),
  };
  return { classes, sections, totals };
}

/**
 * Cost per customer for each marketing channel: spend (its QuickBooks accounts, every class) ÷ new customers (its
 * FieldRoutes lead sources). Also the Wildlife slice: the channel's spend in the Wildlife class ÷ its new wildlife customers.
 */
export function buildMarketing(data) {
  const pl = data?.pl || [];
  const nc = data?.new_customers || [];
  const spendOf = (accounts, onlyWildlife) => pl
    .filter((r) => accounts.includes(r.account_name) && (!onlyWildlife || isWildlife(r.class)))
    .reduce((t, r) => t + n(r.amount), 0);
  const custOf = (sources, onlyWildlife) => nc
    .filter((r) => sources.includes(r.source) && (!onlyWildlife || r.wildlife))
    .reduce((t, r) => t + n(r.n), 0);
  const per = (s, c) => (c > 0 ? s / c : null);
  const rows = (data?.channels || []).map((ch) => {
    const accounts = ch.qbo_accounts || [];
    const sources = ch.fr_sources || [];
    const spend = spendOf(accounts, false);
    const customers = custOf(sources, false);
    const wSpend = spendOf(accounts, true);
    const wCustomers = custOf(sources, true);
    return { ...ch, spend, customers, cpc: per(spend, customers), wSpend, wCustomers, wCpc: per(wSpend, wCustomers),
      set: accounts.length > 0 && sources.length > 0 };
  });
  const allAccounts = [...new Set(rows.flatMap((r) => r.qbo_accounts || []))];
  const allSources = [...new Set(rows.flatMap((r) => r.fr_sources || []))];
  const total = { spend: spendOf(allAccounts, false), customers: custOf(allSources, false) };
  total.cpc = per(total.spend, total.customers);
  const mapped = new Set(allSources);
  const unmapped = Object.entries(nc.reduce((m, r) => { if (!mapped.has(r.source)) m[r.source] = (m[r.source] || 0) + n(r.n); return m; }, {}))
    .sort((a, b) => b[1] - a[1]);
  return { rows, total, unmapped };
}

export const money = (x) => `${n(x) < 0 ? '-' : ''}$${Math.abs(Math.round(n(x))).toLocaleString('en-US')}`;
