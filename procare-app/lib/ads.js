/**
 * Ads (change 71): Google Guaranteed (Local Services) and Google Ads, from ads_data(): spend, leads, cost per lead,
 * and new FieldRoutes customers from the Google lead sources picked in Ads -> Settings, for cost per customer.
 */
import { financeRange } from './finance';

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (ymd, k) => new Date(Date.parse(`${ymd}T12:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const MONTH = /^(\d{4})-(\d{2})$/;

// Google numbers are daily, so the presets include rolling days (unlike Finance, which is whole months)
export const ADS_PERIODS = [
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'ytd', label: 'Year to date' },
];

/** { key, from, to, label, fromMonth, toMonth } from ?p=… or a custom month range (?from=YYYY-MM&to=YYYY-MM). */
export function pickAdsRange(searchParams, today) {
  const f = MONTH.exec(searchParams?.from || '');
  const t = MONTH.exec(searchParams?.to || searchParams?.from || '');
  if (f && t) {
    let [fy, fm, ty, tm] = [Number(f[1]), Number(f[2]), Number(t[1]), Number(t[2])];
    if (fy * 12 + fm > ty * 12 + tm) [fy, fm, ty, tm] = [ty, tm, fy, fm];
    if (fm >= 1 && fm <= 12 && tm >= 1 && tm <= 12) {
      return { key: 'custom', label: 'Custom range', from: `${fy}-${pad(fm)}-01`, to: `${ty}-${pad(tm)}-${pad(lastDay(ty, tm))}`,
        fromMonth: `${fy}-${pad(fm)}`, toMonth: `${ty}-${pad(tm)}` };
    }
  }
  const key = ADS_PERIODS.some((p) => p.key === searchParams?.p) ? searchParams.p : 'last30';
  const days = { last7: 7, last30: 30, last90: 90 }[key];
  const r = days ? { from: addDays(today, -(days - 1)), to: today } : { ...financeRange(key, today) };
  if (key === 'thisMonth') r.to = today;
  return { key, from: r.from, to: r.to, label: ADS_PERIODS.find((p) => p.key === key).label, fromMonth: r.from.slice(0, 7), toMonth: r.to.slice(0, 7) };
}

const n = (x) => Number(x) || 0;
const per = (a, b) => (b > 0 ? a / b : null);

/** Google's codes in plain words: PHONE_CALL → Phone call, xcat:service_area_business_pest_control → Pest control. */
export function words(code) {
  if (!code) return '';
  const s = String(code).replace(/^.*:/, '').replace(/^service_area_business_/, '').replace(/_/g, ' ').toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const LEAD_STATUS = {
  NEW: 'New', ACTIVE: 'Active', BOOKED: 'Booked', DECLINED: 'Declined', EXPIRED: 'Expired', DISABLED: 'Disabled',
  CONSUMER_DECLINED: 'Customer declined', WIPED_OUT: 'Removed',
};

/**
 * ads_data() → { total, accounts, campaigns, services, types, wildlife, days }
 * Cost per lead = spend ÷ charged leads (Google Guaranteed only charges for valid leads; credited ones are refunded).
 * Customers per account: the new customers of the account's office (accounts without an office only count in the total).
 */
export function buildAds(data) {
  const accounts = data?.accounts || [];
  const spend = data?.spend || [];
  const leads = data?.leads || [];
  const cust = data?.customers || [];
  const isCharged = (l) => l.charged && l.credit_state !== 'CREDITED';
  const sum = (rows, f) => rows.reduce((t, r) => t + n(f(r)), 0);
  const leadStats = (ls) => ({
    leads: ls.length, charged: ls.filter(isCharged).length, credited: ls.filter((l) => l.credit_state === 'CREDITED').length,
    booked: ls.filter((l) => l.status === 'BOOKED').length,
  });

  const acctRows = accounts.map((a) => {
    const sp = spend.filter((s) => s.customer_id === a.id);
    const cost = sum(sp, (s) => s.cost);
    const st = leadStats(leads.filter((l) => l.customer_id === a.id));
    const customers = a.office ? sum(cust.filter((c) => c.office === a.office), (c) => c.n) : null;
    return { ...a, cost, impressions: sum(sp, (s) => s.impressions), clicks: sum(sp, (s) => s.clicks), ...st,
      cpl: per(cost, st.charged || st.leads), customers, cpc: customers === null ? null : per(cost, customers) };
  }).filter((a) => a.cost > 0 || a.leads > 0 || a.status === 'ENABLED');

  const cost = sum(spend, (s) => s.cost);
  const st = leadStats(leads);
  const customers = sum(cust, (c) => c.n);
  const sold = sum(cust, (c) => c.sold);
  const total = { cost, ...st, cpl: per(cost, st.charged || st.leads), customers, cpc: per(cost, customers), sold,
    clicks: sum(spend, (s) => s.clicks), impressions: sum(spend, (s) => s.impressions) };

  const name = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const campaigns = spend.map((s) => ({ ...s, account: name[s.customer_id] || s.customer_id, google_guaranteed: s.channel_type === 'LOCAL_SERVICES' }))
    .filter((s) => n(s.cost) > 0 || n(s.clicks) > 0).sort((a, b) => n(b.cost) - n(a.cost));

  const group = (key) => Object.values(leads.reduce((m, l) => {
    const k = key(l) || 'Other';
    (m[k] ||= { name: k, list: [] }).list.push(l);
    return m;
  }, {})).map((g) => ({ name: g.name, ...leadStats(g.list) })).sort((a, b) => b.leads - a.leads);

  const wild = cust.filter((c) => c.wildlife);
  return {
    total, accounts: acctRows, campaigns,
    services: group((l) => words(l.service) || words(l.category)),
    types: group((l) => words(l.lead_type)),
    wildlife: { customers: sum(wild, (c) => c.n), sold: sum(wild, (c) => c.sold) },
  };
}

export const money = (x) => `${n(x) < 0 ? '-' : ''}$${Math.abs(Math.round(n(x))).toLocaleString('en-US')}`;
export const money2 = (x) => (x === null || x === undefined ? '–' : `$${n(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
