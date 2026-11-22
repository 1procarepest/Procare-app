// Inventory (change 84): the monthly count per place, one item list with one price, the dashboard and the BWI Expo.
// Shared by Operations → Inventory and Wildlife → Inventory.

const n = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
export const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
export const KINDS = { product: 'Product', tbs: 'Termite baiting', equipment: 'Equipment', promo: 'Promotional', uniform: 'Uniform (by size)' };
export const SECTIONS = { pest: 'Pest', wildlife: 'Wildlife' };
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const VALUED = new Set(['product', 'tbs', 'promo']);

export const monthStart = (ymd) => `${String(ymd).slice(0, 7)}-01`;
export const monthLabel = (ymd, long = false) => {
  const [y, m] = String(ymd).split('-').map(Number);
  return long ? new Date(y, m - 1, 15).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : `${MONTHS[m - 1]} ${y}`;
};
export const addMonth = (ymd, k) => {
  const [y, m] = String(ymd).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.toISOString().slice(0, 10);
};

/** What one count line is worth (equipment: the working ones). */
export function lineValue(line, item) {
  const price = n(line?.price ?? item?.price) || 0;
  return (n(line?.qty) || 0) * price;
}

/** Item ids → lines, for one count. */
function byItem(lines, countId) {
  const out = {};
  for (const l of lines) if (l.count_id === countId) out[l.item_id] = l;
  return out;
}

/**
 * Everything the pages show.
 * Returns { month, locations, items, counts, current(loc, section), previous(loc, section), dashboard, bwi }.
 */
export function buildInventory(data) {
  const month = data.month;
  const items = data.items || [];
  const counts = data.counts || [];
  const lines = data.lines || [];
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));

  const findCount = (loc, section, pred) => counts.filter((c) => c.location === loc && c.section === section && pred(c))
    .sort((a, b) => (a.month < b.month ? 1 : -1))[0] || null;
  const current = (loc, section) => {
    const c = findCount(loc, section, (x) => x.month === month);
    return { count: c, lines: c ? byItem(lines, c.id) : {} };
  };
  const previous = (loc, section) => {
    const c = findCount(loc, section, (x) => x.month < month);
    return { count: c, lines: c ? byItem(lines, c.id) : {} };
  };

  // Dashboard: value per place per month this year (a finished count beats the sheet's number)
  const year = month.slice(0, 4);
  const months = MONTHS.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`);
  const hist = data.history || [];
  const cell = (loc, section, m) => {
    const c = counts.find((x) => x.location === loc && x.section === section && x.month === m && (x.status === 'done' || x.source === 'sheet'))
      || counts.find((x) => x.location === loc && x.section === section && x.month === m);
    if (c) return { total: n(c.total) || 0, tbs: n(c.tbs) || 0, equipment: n(c.equipment) || 0, status: c.status, from: 'count' };
    const h = hist.find((x) => x.location === loc && x.section === section && x.month === m);
    if (h) return { total: n(h.total) || 0, tbs: n(h.tbs) || 0, equipment: null, status: 'done', from: 'sheet' };
    return null;
  };
  const rows = [];
  for (const l of data.locations || []) {
    rows.push({ key: `${l.key}-pest`, label: l.name, loc: l.key, section: 'pest', cells: months.map((m) => cell(l.key, 'pest', m)) });
    if (l.has_wildlife) rows.push({ key: `${l.key}-wildlife`, label: `Wildlife (at ${l.name.replace(/\s*\(.*\)/, '')})`, loc: l.key, section: 'wildlife', cells: months.map((m) => cell(l.key, 'wildlife', m)) });
  }
  const totals = months.map((_, i) => {
    const vals = rows.map((r) => r.cells[i]).filter(Boolean);
    return vals.length ? { total: vals.reduce((s, v) => s + v.total, 0), tbs: vals.reduce((s, v) => s + v.tbs, 0) } : null;
  });
  // The latest month every place has a number for (a month half counted would look like a big drop)
  const pestRows = rows.filter((r) => r.section === 'pest' && r.cells.some(Boolean));
  const full = (i) => pestRows.length > 0 && pestRows.every((r) => r.cells[i]);
  let lastIdx = -1;
  for (let i = 0; i < months.length; i += 1) if (full(i)) lastIdx = i;
  if (lastIdx < 0) lastIdx = totals.reduce((k, t, i) => (t ? i : k), -1);

  return {
    month, items, itemById, counts, current, previous,
    locations: data.locations || [],
    dashboard: { months, rows, totals, lastIdx },
    bwi: data.bwi ? buildBwi(data.bwi, data.locations || [], month) : null,
  };
}

/** The BWI Expo: what's committed per account (place), what's come in, and paying it off by the pay-by date. */
export function buildBwi(bwi, locations, month) {
  const show = (bwi.shows || [])[0] || null;
  const list = bwi.commitments || [];
  const placeOf = Object.fromEntries(locations.filter((l) => l.bwi_account).map((l) => [l.bwi_account, l]));
  const accounts = [...new Set(list.map((c) => c.account))].sort().map((a) => {
    const rows = list.filter((c) => c.account === a);
    const total = rows.reduce((s, c) => s + (n(c.total) || 0), 0);
    const inValue = rows.reduce((s, c) => s + Math.min(n(c.received) || 0, n(c.qty) || 0) * (n(c.price) || 0), 0);
    return { account: a, place: placeOf[a] || null, rows, total, inValue, bonus: rows.reduce((s, c) => s + (n(c.bonus) || 0), 0) };
  });
  const total = accounts.reduce((s, a) => s + a.total, 0);
  const paid = n(show?.paid) || 0;
  const left = Math.max(0, total - paid);
  // Months to pay: from this month through the month before pay-by (June 1 → through May)
  let monthsLeft = null;
  if (show?.pay_by) {
    const [y1, m1] = month.split('-').map(Number);
    const [y2, m2] = show.pay_by.split('-').map(Number);
    monthsLeft = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
  }
  return {
    show, accounts, total, paid, left, monthsLeft,
    perMonth: monthsLeft ? left / monthsLeft : null,
    bonus: accounts.reduce((s, a) => s + a.bonus, 0),
    inValue: accounts.reduce((s, a) => s + a.inValue, 0),
    prices: bwi.prices || [],
  };
}

/** Category order: as the items are sorted (the sheet's order). */
export function groupByCategory(items) {
  const out = [];
  const at = {};
  for (const i of items) {
    if (!(i.category in at)) { at[i.category] = out.length; out.push({ category: i.category, items: [] }); }
    out[at[i.category]].items.push(i);
  }
  return out;
}

export { n as num };
