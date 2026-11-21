// Operations → Maintenance (change 82): oil changes due, and what maintenance has cost. Shared by the page and the
// Monday reminder email.

const n = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
export const SERVICE = { oil: 'Oil change', tires: 'Tires', brakes: 'Brakes', inspection: 'Inspection', other: 'Other' };
export const SOON_MILES = 500;
export const SOON_DAYS = 14;

const dayNum = (ymd) => Math.round(Date.parse(`${String(ymd).slice(0, 10)}T12:00:00Z`) / 864e5);
const addMonths = (ymd, k) => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, Math.min(d, 28)));
  return t.toISOString().slice(0, 10);
};

/** The truck's miles now: Samsara's odometer when it's from the last 10 days, else the sheet's. */
export function milesNow(t, today) {
  const odo = n(t.odometer);
  if (odo && t.odometer_at && dayNum(today) - dayNum(t.odometer_at) <= 10) return odo;
  return n(t.mileage) ?? odo;
}

/**
 * Oil change status for one truck. rules: { miles, months }.
 * Returns { status: 'overdue' | 'soon' | 'ok' | 'none', now, since, left, dueOn, daysLeft }.
 */
export function oilStatus(t, rules, today) {
  const now = milesNow(t, today);
  const last = t.last_oil;
  if (!last) return { status: 'none', now };
  const since = now !== null && n(last.miles) !== null ? now - n(last.miles) : null;
  const left = since !== null ? rules.miles - since : null;
  const dueOn = addMonths(last.day, rules.months);
  const daysLeft = dayNum(dueOn) - dayNum(today);
  let status = 'ok';
  if ((left !== null && left <= 0) || daysLeft <= 0) status = 'overdue';
  else if ((left !== null && left <= SOON_MILES) || daysLeft <= SOON_DAYS) status = 'soon';
  return { status, now, since, left, dueOn, daysLeft };
}

const ORDER = { overdue: 0, none: 1, soon: 2, ok: 3 };

/** Everything the page shows. */
export function buildMaintenance(data, today) {
  const rules = data?.rules || { miles: 5000, months: 6 };
  const trucks = (data?.trucks || []).map((t) => ({ ...t, oil: oilStatus(t, rules, today) }))
    .sort((a, b) => ORDER[a.oil.status] - ORDER[b.oil.status] || (a.oil.left ?? 1e9) - (b.oil.left ?? 1e9));
  const entries = data?.entries || [];
  const sum = (list) => list.reduce((s, e) => s + (n(e.cost) || 0), 0);
  const month = today.slice(0, 7);
  const byTruck = {};
  for (const e of entries) {
    const k = e.truck_id;
    byTruck[k] = byTruck[k] || { truck_no: e.truck_no, vehicle: e.vehicle, office: e.office, cost: 0, count: 0 };
    byTruck[k].cost += n(e.cost) || 0; byTruck[k].count += 1;
  }
  const byOffice = {};
  for (const e of entries) byOffice[e.office || 'none'] = (byOffice[e.office || 'none'] || 0) + (n(e.cost) || 0);
  const byService = {};
  for (const e of entries) byService[e.service || 'other'] = (byService[e.service || 'other'] || 0) + (n(e.cost) || 0);
  return {
    rules, trucks, entries,
    counts: Object.fromEntries(['overdue', 'soon', 'none', 'ok'].map((s) => [s, trucks.filter((t) => t.oil.status === s).length])),
    spend: { total: sum(entries), thisMonth: sum(entries.filter((e) => e.day.slice(0, 7) === month)) },
    byTruck: Object.values(byTruck).sort((a, b) => b.cost - a.cost),
    byOffice, byService,
    odometerAt: (data?.trucks || []).map((t) => t.odometer_at).filter(Boolean).sort().pop() || null,
  };
}
