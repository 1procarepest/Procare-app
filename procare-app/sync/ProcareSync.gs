/**
 * Procare Sync: one copy of FieldRoutes data in Supabase, for every Procare app.
 *
 * Replaces the FieldRoutes pulls in the Operations Suite, Tech Scorecard and Rep Cards
 * scripts. Those keep working until each app moves into the employee app; then their
 * schedules are turned off.
 *
 * Keys live in Project Settings → Script Properties, never in this file:
 *   FR_BASE_URL          https://procarepest.fieldroutes.com/api   (optional; this is the default)
 *   EAST_KEY  EAST_TOKEN     FieldRoutes API key and token, one pair per office
 *   WEST_KEY  WEST_TOKEN
 *   SOUTH_KEY SOUTH_TOKEN
 *   SUPABASE_URL         https://<project>.supabase.co
 *   SUPABASE_SECRET_KEY  Supabase secret key (Project Settings → API Keys)
 *
 * First time (see sync/README.md):
 *   1. testConnections   checks every key, FieldRoutes and Supabase
 *   2. inspectFields     logs the field NAMES FieldRoutes sends (no customer data)
 *   3. setup             turns on the 5-minute schedule
 *   4. runBackfill       loads history since BACKFILL_START; continues by itself until done
 *
 * How it saves calls: it asks FieldRoutes only for records changed since the last run,
 * gets them back in the same call when it can, and refreshes slow-moving data less often.
 * Every run is logged in Supabase (fr_sync_runs) with the number of FieldRoutes calls used.
 */

const SYNC = {
  TZ: 'America/New_York',
  API_TZ: 'America/Los_Angeles',          // FieldRoutes sends and expects Pacific time
  BACKFILL_START: '2025-01-01',           // last year too, so "this year vs last year" works
  OFFICES: [
    { key: 'east',  prop: 'EAST'  },
    { key: 'west',  prop: 'WEST'  },
    { key: 'south', prop: 'SOUTH' }
  ],
  HOURS: { start: 7, end: 22 },           // regular syncing 7:00 AM – 9:59 PM Eastern, every day
  EVERY_MIN: {                            // how often each kind of data is refreshed
    changes: 15,                          // subscriptions, appointments, doors changed since last time
    customers: 30,                        // customers changed since last time (auto-pay tracking)
    reviews: 30,
    lists: 120                            // employees, service types, cancellation reasons
  },
  FULL_HOURS: [7, 13],                    // full refresh of active customers, services, cards on file
  OVERLAP_MIN: 10,                        // re-check this many minutes before the last run, to miss nothing
  MAX_RUN_MS: 4.5 * 60 * 1000,            // stay under Apps Script's 6-minute limit
  FR_GAP_MS: 600,                         // ≈100 FieldRoutes calls a minute per key (limit is about 120)
  UPSERT_BATCH: 500,
  PRODUCTION_FIELD: 'productionValue'     // appointment field counted as production
};

const PROPS = PropertiesService.getScriptProperties();
let CALLS = 0;                            // FieldRoutes calls made in this run

/* ======================================================================
 * Schedule
 * ====================================================================== */

/** Runs every 5 minutes (see setup). Works through queued steps; adds whatever is due. */
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;                    // the last run is still going
  const started = Date.now();
  const startedIso = new Date().toISOString();
  CALLS = 0;
  const ran = [], errors = [], retry = [];
  try {
    let queue = loadQueue_();
    if (!queue.length && PROPS.getProperty('BACKFILL_DONE') && inHours_()) queue = dueSteps_();
    while (queue.length && Date.now() - started < SYNC.MAX_RUN_MS) {
      const step = queue.shift();
      try {
        runStep_(step);
        ran.push(label_(step));
      } catch (e) {
        errors.push(label_(step) + ': ' + e.message);
        step.tries = (step.tries || 0) + 1;
        if (step.tries < 3) retry.push(step);            // try again on a later run, up to 3 times
      }
    }
    saveQueue_(queue.concat(retry));
  } finally {
    lock.releaseLock();
  }
  if (ran.length || errors.length) logRun_(startedIso, ran, errors);
}

function inHours_() {
  const h = Number(Utilities.formatDate(new Date(), SYNC.TZ, 'H'));
  return h >= SYNC.HOURS.start && h < SYNC.HOURS.end;
}

/** Steps that are due now, for every office. */
function dueSteps_() {
  const now = Date.now();
  const steps = [];
  const due = (group, minutes) => {
    const last = Number(PROPS.getProperty('LAST_' + group) || 0);
    if (now - last < minutes * 60000 - 30000) return false;
    PROPS.setProperty('LAST_' + group, String(now));
    return true;
  };
  const every = (jobs) => SYNC.OFFICES.forEach(o => jobs.forEach(job => steps.push({ o: o.key, job: job })));

  if (due('lists', SYNC.EVERY_MIN.lists)) every(['lists']);
  if (due('changes', SYNC.EVERY_MIN.changes)) every(['subs:since', 'appts:since', 'doors:since']);
  if (due('customers', SYNC.EVERY_MIN.customers)) every(['cust:since']);
  if (due('reviews', SYNC.EVERY_MIN.reviews)) every(['reviews:recent']);

  const hour = Number(Utilities.formatDate(new Date(), SYNC.TZ, 'H'));
  const slot = Utilities.formatDate(new Date(), SYNC.TZ, 'yyyy-MM-dd') + ' ' + hour;
  if (SYNC.FULL_HOURS.indexOf(hour) >= 0 && PROPS.getProperty('LAST_FULL_SLOT') !== slot) {
    PROPS.setProperty('LAST_FULL_SLOT', slot);
    every(['full:customers', 'full:subs', 'full:cards']);
  }
  return steps;
}

// The queue can be bigger than one Script Property allows (about 9 KB), so it's saved in pieces.
function loadQueue_() {
  const n = Number(PROPS.getProperty('QUEUE_PARTS') || 0);
  let json = '';
  for (let i = 0; i < n; i++) json += PROPS.getProperty('QUEUE_' + i) || '';
  try { return json ? JSON.parse(json) : []; } catch (e) { return []; }
}
function saveQueue_(q) {
  const old = Number(PROPS.getProperty('QUEUE_PARTS') || 0);
  for (let i = 0; i < old; i++) PROPS.deleteProperty('QUEUE_' + i);
  PROPS.deleteProperty('QUEUE_PARTS');
  if (!q.length) return;
  const json = JSON.stringify(q);
  let n = 0;
  for (let i = 0; i < json.length; i += 8000) PROPS.setProperty('QUEUE_' + (n++), json.slice(i, i + 8000));
  PROPS.setProperty('QUEUE_PARTS', String(n));
}
function label_(s) { return s.o + ' ' + s.job + (s.from ? ' ' + s.from + '→' + s.to : ''); }

/* ======================================================================
 * Entry points (run from the editor)
 * ====================================================================== */

/** Turns on the 5-minute schedule. Safe to run again. */
function setup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'tick')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  Logger.log('Schedule on: every 5 minutes. Regular syncing ' + SYNC.HOURS.start + ':00–' + SYNC.HOURS.end +
    ':00 Eastern once the backfill is done. Run runBackfill next if you haven’t.');
}

/** Loads history since BACKFILL_START. Runs a piece every 5 minutes until done (needs setup first). */
function runBackfill() {
  const steps = [];
  SYNC.OFFICES.forEach(o => steps.push({ o: o.key, job: 'lists' }));
  const start = SYNC.BACKFILL_START;
  const today = ymd_(new Date());
  const nextMonthEnd = monthEnd_(addMonths_(today.slice(0, 8) + '01', 1));
  SYNC.OFFICES.forEach(o => {
    steps.push({ o: o.key, job: 'subs:query', what: 'added', from: start });
    steps.push({ o: o.key, job: 'subs:query', what: 'cancelled', from: start });
    steps.push({ o: o.key, job: 'full:subs' });
    steps.push({ o: o.key, job: 'cust:query', from: start });
    steps.push({ o: o.key, job: 'full:customers' });
    steps.push({ o: o.key, job: 'full:cards' });
    months_(start, nextMonthEnd).forEach(m => steps.push({ o: o.key, job: 'appts:range', from: m[0], to: m[1] }));
    months_(start, today).forEach(m => steps.push({ o: o.key, job: 'doors:range', from: m[0], to: m[1] }));
    steps.push({ o: o.key, job: 'reviews:range', from: start, to: today });
  });
  steps.push({ o: '-', job: 'backfill:done', at: nowPacific_() });
  PROPS.deleteProperty('BACKFILL_DONE');
  saveQueue_(steps);
  Logger.log('Backfill queued: ' + steps.length + ' steps. It runs a few minutes at a time on the 5-minute ' +
    'schedule; check progress with showStatus. Starting the first piece now…');
  tick();
}

/** Runs whatever is due right now, outside the schedule. */
function syncNow() {
  ['lists', 'changes', 'customers', 'reviews'].forEach(g => PROPS.deleteProperty('LAST_' + g));
  if (!loadQueue_().length) saveQueue_(dueSteps_());
  tick();
  showStatus();
}

/** Clears a stuck queue (e.g. after fixing a key). Doesn't touch stored data or the backfill flag. */
function resetQueue() {
  saveQueue_([]);
  Logger.log('Queue cleared.');
}

function showStatus() {
  const q = loadQueue_();
  Logger.log('Backfill: ' + (PROPS.getProperty('BACKFILL_DONE') ? 'done ' + PROPS.getProperty('BACKFILL_DONE') : 'not finished'));
  Logger.log('Steps waiting: ' + q.length + (q.length ? ' (next: ' + q.slice(0, 3).map(label_).join(', ') + ')' : ''));
  SYNC.OFFICES.forEach(o => ['subs', 'appts', 'doors', 'cust'].forEach(e => {
    const c = PROPS.getProperty('CUR_' + e + '_' + o.key);
    if (c) Logger.log(o.key + ' ' + e + ' checked through ' + c + ' (Pacific)');
  }));
  Logger.log('Recent runs and FieldRoutes calls: see fr_sync_runs in Supabase.');
}

/* ======================================================================
 * Steps
 * ====================================================================== */

function runStep_(s) {
  if (s.job === 'backfill:done') {
    // Changes are tracked from the moment the backfill was queued, so nothing in between is missed.
    SYNC.OFFICES.forEach(o => ['subs', 'appts', 'doors', 'cust'].forEach(e => PROPS.setProperty('CUR_' + e + '_' + o.key, s.at)));
    PROPS.setProperty('BACKFILL_DONE', Utilities.formatDate(new Date(), SYNC.TZ, 'MMM d, h:mm a'));
    return;
  }
  const o = office_(s.o);
  switch (s.job) {
    case 'lists': return pullLists_(o);

    case 'subs:since':  return since_(o, 'subs', from => pullSubs_(o, { dateUpdated: { operator: '>=', value: from } }));
    case 'subs:query':
      return pullSubs_(o, s.what === 'added'
        ? { dateAdded: { operator: '>=', value: s.from } }
        : { dateCancelled: { operator: '>=', value: s.from } });

    case 'appts:since': return since_(o, 'appts', from => pullAppts_(o, { dateUpdated: { operator: '>=', value: from } }));
    case 'appts:range': return pullAppts_(o, { date: { operator: 'BETWEEN', value: [s.from, s.to] } });

    case 'doors:since': return since_(o, 'doors', from => pullDoors_(o, { dateUpdated: { operator: '>=', value: from } }));
    case 'doors:range':
      return pullDoors_(o, { dateUpdated: { operator: 'BETWEEN', value: [s.from + ' 00:00:00', s.to + ' 23:59:59'] } });

    case 'cust:since':  return since_(o, 'cust', from => pullCustomers_(o, { dateUpdated: { operator: '>=', value: from } }));
    case 'cust:query':  return pullCustomers_(o, { dateAdded: { operator: '>=', value: s.from } });

    case 'reviews:recent': {
      const today = ymd_(new Date());
      return pullReviews_(o, addDays_(today, -3), today);
    }
    case 'reviews:range': return pullReviews_(o, s.from, s.to);

    case 'full:customers':
      pullCustomers_(o, { status: 1 });
      return pullCustomers_(o, { responsibleBalance: { operator: '>', value: 0 } });
    case 'full:subs':  return pullSubs_(o, { active: 1 });
    case 'full:cards': return pullCards_(o);
  }
  throw new Error('Unknown step ' + s.job);
}

/** Runs a "changed since" pull and moves that office's bookmark forward only if it worked. */
function since_(o, entity, pull) {
  const key = 'CUR_' + entity + '_' + o.key;
  const from = PROPS.getProperty(key);
  if (!from) return;                                    // backfill not finished for this office
  const startedAt = nowPacific_();
  pull(minusMinutesPacific_(from, SYNC.OVERLAP_MIN));
  PROPS.setProperty(key, startedAt);
}

/* ---------- Pulls ---------- */

function pullLists_(o) {
  const now = new Date().toISOString();
  const emps = frFetch_(o, 'employee', { active: { operator: 'IN', value: [0, 1] } });
  supaUpsert_('fr_employees', emps.map(e => ({
    office: o.key, employee_id: id_(e.employeeID), first_name: str_(e.fname), last_name: str_(e.lname),
    type: num_(e.type), active: bool_(e.active), pic: str_(e.pic), synced_at: now
  })).filter(r => r.employee_id), ['office', 'employee_id']);

  const types = frFetch_(o, 'serviceType', {});
  supaUpsert_('fr_service_types', types.map(t => ({
    office: o.key, type_id: id_(t.typeID !== undefined ? t.typeID : t.serviceTypeID),
    description: str_(t.description || t.name), is_reservice: t.reservice === undefined ? null : bool_(t.reservice), synced_at: now
  })).filter(r => r.type_id), ['office', 'type_id']);

  let reasons = [];
  try { reasons = frFetch_(o, 'cancellationReason', {}); } catch (e) { /* optional */ }
  const names = {};
  const rows = reasons.map(r => {
    const id = id_(r.reasonID || r.cancellationReasonID || r.id);
    const name = str_(r.reason || r.description || r.name || r.cancellationReason);
    if (id) names[id] = name;
    return { office: o.key, reason_id: id, name: name, synced_at: now };
  }).filter(r => r.reason_id);
  supaUpsert_('fr_cancellation_reasons', rows, ['office', 'reason_id']);
  PROPS.setProperty('REASONS_' + o.key, JSON.stringify(names));
}

function pullSubs_(o, params) {
  const now = new Date().toISOString();
  const names = JSON.parse(PROPS.getProperty('REASONS_' + o.key) || '{}');
  // Search for IDs, then get the records with cancellation reasons attached.
  const subs = frFetch_(o, 'subscription', params, { withData: false, getExtra: { includeCancellationReason: 1 } });
  supaUpsert_('fr_subscriptions', subs.map(s => ({
    subscription_id: id_(s.subscriptionID), office: officeOf_(s, o), customer_id: id_(s.customerID),
    service_id: id_(s.serviceID), service_type: str_(s.serviceType), active: bool_(s.active),
    date_added: ts_(s.dateAdded), date_cancelled: day_(s.dateCancelled), date_updated: ts_(s.dateUpdated),
    sold_by: id_(s.soldBy), sold_by_2: id_(s.soldBy2), source: str_(s.source),
    frequency: num_(s.frequency), billing_frequency: str_(s.billingFrequency),
    recurring_charge: num_(s.recurringCharge), contract_value: num_(s.contractValue),
    initial_service_total: num_(s.initialServiceTotal), initial_appointment_id: id_(s.initialAppointmentID),
    initial_status: num_(s.initialStatus), initial_status_text: str_(s.initialStatusText),
    autopay_payment_profile_id: id_(s.autopayPaymentProfileID), next_service: day_(s.nextService),
    on_hold: bool_(s.onHold), seasonal_start: str_(s.seasonalStart), seasonal_end: str_(s.seasonalEnd),
    completed_appointment_ids: idList_(s.completedAppointmentIDs), cancel_reason: cancelReason_(s, names),
    synced_at: now
  })).filter(r => r.subscription_id), ['subscription_id']);
}

function pullAppts_(o, params) {
  const now = new Date().toISOString();
  const appts = frFetch_(o, 'appointment', params);
  supaUpsert_('fr_appointments', appts.map(a => ({
    appointment_id: id_(a.appointmentID), office: officeOf_(a, o), customer_id: id_(a.customerID),
    subscription_id: id_(a.subscriptionID), date: day_(a.date), start_time: time_(a.start), end_time: time_(a.end),
    status: num_(a.status), status_text: str_(a.statusText), type_id: id_(a.type),
    employee_id: id_(a.employeeID), serviced_by: id_(a.servicedBy), route_id: id_(a.routeID), spot_id: id_(a.spotID),
    is_initial: bool_(a.isInitial), production_value: num_(a[SYNC.PRODUCTION_FIELD]),
    original_appointment_id: id_(a.originalAppointmentID), reservice_reason_id: id_(a.reserviceReasonID),
    date_added: ts_(a.dateAdded), date_completed: ts_(a.dateCompleted), date_updated: ts_(a.dateUpdated),
    synced_at: now
  })).filter(r => r.appointment_id), ['appointment_id']);
}

function pullDoors_(o, params) {
  const now = new Date().toISOString();
  const doors = frFetch_(o, 'door', params);
  supaUpsert_('fr_doors', doors.map(d => ({
    door_id: id_(d.doorID), office: officeOf_(d, o), employee_id: id_(d.employeeID),
    status: num_(d.status), knocks: num_(d.knockCounter),
    has_info: [d.name, d.phone, d.email].some(x => String(x === undefined || x === null ? '' : x).trim() !== ''),
    latitude: num_(first_(d, ['latitude', 'lat'])), longitude: num_(first_(d, ['longitude', 'lng', 'lon'])),
    city: str_(d.city), zip: str_(d.zip), time_created: ts_(d.timeCreated), date_updated: ts_(d.dateUpdated),
    synced_at: now
  })).filter(r => r.door_id), ['door_id']);
}

function pullCustomers_(o, params) {
  const now = new Date().toISOString();
  const custs = frFetch_(o, 'customer', params);
  supaUpsert_('fr_customers', custs.map(c => ({
    customer_id: id_(c.customerID), office: officeOf_(c, o),
    last_name: str_(c.lname), company_name: str_(c.companyName),          // never first name or address
    status: num_(c.status), autopay: str_(c.aPay), autopay_profile_id: id_(c.autoPayPaymentProfileID),
    balance: num_(c.responsibleBalance !== undefined ? c.responsibleBalance : c.balance),
    balance_age: num_(c.responsibleBalanceAge !== undefined ? c.responsibleBalanceAge : c.balanceAge),
    date_added: ts_(c.dateAdded), date_updated: ts_(c.dateUpdated), synced_at: now
  })).filter(r => r.customer_id), ['customer_id']);
}

/** Status of cards/bank accounts on file for this office's active customers (status only). */
function pullCards_(o) {
  const now = new Date().toISOString();
  const ids = supaSelectIds_('fr_customers', 'customer_id', 'office=eq.' + o.key + '&status=eq.1');
  for (let i = 0; i < ids.length; i += 1000) {
    const profiles = frFetch_(o, 'paymentProfile', { customerIDs: ids.slice(i, i + 1000) });
    supaUpsert_('fr_payment_profiles', profiles.map(p => ({
      payment_profile_id: id_(p.paymentProfileID), office: officeOf_(p, o), customer_id: id_(p.customerID),
      status: num_(p.status), synced_at: now
    })).filter(r => r.payment_profile_id), ['payment_profile_id']);
  }
}

function pullReviews_(o, from, to) {
  const now = new Date().toISOString();
  const reviews = frFetch_(o, 'review', { date: { operator: 'BETWEEN', value: [from + ' 00:00:00', to + ' 23:59:59'] } });
  supaUpsert_('fr_reviews', reviews
    .filter(r => { const d = day_(first_(r, ['date', 'dateAdded'])); return d && d >= from && d <= to; })   // in case the date filter is ignored
    .map(r => ({
      review_id: id_(r.reviewID || r.id), office: officeOf_(r, o), appointment_id: id_(r.appointmentID),
      customer_id: id_(r.customerID), employee_id: id_(r.employeeID), review_date: ts_(first_(r, ['date', 'dateAdded'])),
      stars: num_(first_(r, ['starRating', 'rating', 'stars'])), synced_at: now
    })).filter(r => r.review_id), ['review_id']);
}

/** Cancellation reason text from a subscription's cancellation notes, whatever shape they come in. */
function cancelReason_(s, names) {
  if (!day_(s.dateCancelled)) return null;
  const notes = Array.isArray(s.cancellationNotes) ? s.cancellationNotes : [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i] || {};
    for (const k in n) if (/reason/i.test(k) && !/id$/i.test(k) && n[k] && isNaN(Number(n[k]))) return String(n[k]);
    for (const k in n) if (/reasonid$/i.test(k) && names[String(n[k])]) return names[String(n[k])];
  }
  return 'Not specified';
}

/* ======================================================================
 * FieldRoutes
 * ====================================================================== */

// Records that belong to one office. A key can also see other offices' records,
// so searches for these are limited to the key's own office.
const OFFICE_SCOPED = ['customer', 'subscription', 'appointment', 'paymentProfile'];
const frLastCall_ = {};

function office_(key) {
  const o = SYNC.OFFICES.find(x => x.key === key);
  if (!o) throw new Error('Unknown office ' + key);
  return o;
}

function frCreds_(o) {
  const base = (PROPS.getProperty(o.prop + '_URL') || PROPS.getProperty('FR_BASE_URL') ||
    'https://procarepest.fieldroutes.com/api').replace(/\/+$/, '');
  const key = PROPS.getProperty(o.prop + '_KEY');
  const token = PROPS.getProperty(o.prop + '_TOKEN');
  if (!key || !token) throw new Error('Missing Script Properties ' + o.prop + '_KEY / ' + o.prop + '_TOKEN');
  return { base: base, key: key, token: token };
}

/** One FieldRoutes call. Objects/arrays are sent as JSON strings, which is what the API expects. */
function frCall_(o, path, params) {
  const c = frCreds_(o);
  const payload = { authenticationKey: c.key, authenticationToken: c.token };
  Object.keys(params || {}).forEach(k => {
    const v = params[k];
    if (v === undefined || v === null) return;
    payload[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
  const url = c.base + '/' + path;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = (frLastCall_[o.key] || 0) + SYNC.FR_GAP_MS - Date.now();
    if (wait > 0) Utilities.sleep(wait);
    frLastCall_[o.key] = Date.now();
    CALLS++;
    const res = UrlFetchApp.fetch(url, { method: 'post', payload: payload, muteHttpExceptions: true });
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code === 429 || code >= 500 || /requests per minute|rate limit|too many requests/i.test(text)) {
      Utilities.sleep(15000 * attempt);
      continue;
    }
    let body;
    try { body = JSON.parse(text); } catch (e) {
      throw new Error(o.key + ' ' + path + ': got ' + (/^\s*</.test(text) ? 'a web page' : 'something') +
        ' instead of data (check FR_BASE_URL ends in /api)');
    }
    if (code !== 200 || body.success === false) {
      throw new Error(o.key + ' ' + path + ': ' + (body.errorMessage || body.message || ('HTTP ' + code)));
    }
    return body;
  }
  throw new Error(o.key + ' ' + path + ': FieldRoutes kept refusing (rate limit or outage)');
}

/**
 * Search and return full records. Asks for the data in the search itself (one call for up to
 * 1,000 records); anything past that, or everything when withData is false, is fetched 1,000 at a time.
 */
function frFetch_(o, entity, params, opts) {
  opts = opts || {};
  const p = Object.assign({}, params);
  if (OFFICE_SCOPED.indexOf(entity) >= 0 && p.officeIDs === undefined) {
    const id = officeIds_()[o.key];
    if (id) p.officeIDs = [Number(id)];
  }
  const withData = opts.withData !== false;
  if (withData) p.includeData = 1;
  const body = frCall_(o, entity + '/search', p);
  const idsName = body.propertyName || (entity + 'IDs');
  const ids = body[idsName] || [];
  let recs = [];
  let missing = ids;
  if (withData && body.propertyNameData && Array.isArray(body[body.propertyNameData])) {
    recs = body[body.propertyNameData];
    missing = body[idsName + 'NoDataExported'] || [];
  }
  for (let i = 0; i < missing.length; i += 1000) {
    const chunk = missing.slice(i, i + 1000);
    let got = frRecords_(frCall_(o, entity + '/get', Object.assign({ [idsName]: chunk }, opts.getExtra || {})));
    if (!got.length && body.idName && body.idName !== idsName) {        // some lists want the other ID name
      got = frRecords_(frCall_(o, entity + '/get', Object.assign({ [body.idName]: chunk }, opts.getExtra || {})));
    }
    recs = recs.concat(got);
  }
  return recs;
}

/** The record array in a /get response, whatever its key is. */
function frRecords_(body) {
  for (const k in body) {
    const v = body[k];
    if (Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] !== null) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const vals = Object.keys(v).map(x => v[x]);
      if (vals.length && typeof vals[0] === 'object' && vals[0] !== null && !Array.isArray(vals[0])) return vals;
    }
  }
  return [];
}

/** FieldRoutes office ID per office key: saved property, then Supabase offices table, then worked out once. */
let OFFICE_IDS_ = null;
function officeIds_() {
  if (OFFICE_IDS_) return OFFICE_IDS_;
  let ids = {};
  try { ids = JSON.parse(PROPS.getProperty('OFFICE_IDS') || '{}'); } catch (e) {}
  if (SYNC.OFFICES.some(o => !ids[o.key])) {
    try {
      supaGet_('offices?select=key,fr_office_id').forEach(r => { if (r.fr_office_id) ids[r.key] = Number(r.fr_office_id); });
    } catch (e) {}
  }
  SYNC.OFFICES.forEach(o => {
    if (ids[o.key]) return;
    // The office most of this key's recent subscriptions belong to.
    const body = frCall_(o, 'subscription/search', { dateAdded: { operator: '>=', value: SYNC.BACKFILL_START }, includeData: 1 });
    const counts = {};
    (body[body.propertyNameData] || []).forEach(s => { counts[s.officeID] = (counts[s.officeID] || 0) + 1; });
    const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if (best) {
      ids[o.key] = Number(best);
      try { supaPatch_('offices?key=eq.' + o.key, { fr_office_id: Number(best) }); } catch (e) {}
    }
  });
  PROPS.setProperty('OFFICE_IDS', JSON.stringify(ids));
  OFFICE_IDS_ = ids;
  return ids;
}

/** Which office a record belongs to: its own officeID when it has one, else the office whose key pulled it. */
function officeOf_(rec, o) {
  const id = rec && rec.officeID !== undefined ? Number(rec.officeID) : 0;
  if (id) {
    const ids = officeIds_();
    const match = Object.keys(ids).find(k => Number(ids[k]) === id);
    if (match) return match;
  }
  return o.key;
}

/* ======================================================================
 * Supabase
 * ====================================================================== */

function supaCfg_() {
  const url = (PROPS.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = PROPS.getProperty('SUPABASE_SECRET_KEY') || '';
  if (!url || !key) throw new Error('Missing Script Properties SUPABASE_URL / SUPABASE_SECRET_KEY');
  return { url: url, key: key };
}

function supaFetch_(method, path, body, extraHeaders) {
  const c = supaCfg_();
  const headers = Object.assign({ apikey: c.key }, extraHeaders || {});
  if (/^eyJ/.test(c.key)) headers.Authorization = 'Bearer ' + c.key;     // older JWT-style keys
  const opts = { method: method, headers: headers, muteHttpExceptions: true };
  if (body !== undefined) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = UrlFetchApp.fetch(c.url + '/rest/v1/' + path, opts);
    const code = res.getResponseCode();
    if (code >= 500 && attempt < 3) { Utilities.sleep(3000 * attempt); continue; }
    if (code >= 300) throw new Error('Supabase ' + method + ' ' + path.split('?')[0] + ' (' + code + '): ' + res.getContentText().slice(0, 300));
    const text = res.getContentText();
    return text ? JSON.parse(text) : null;
  }
}

/** Insert or update rows, 500 at a time. Duplicates within a batch keep the last copy. */
function supaUpsert_(table, rows, keyCols) {
  if (!rows.length) return;
  const byKey = new Map();
  rows.forEach(r => byKey.set(keyCols.map(k => r[k]).join('|'), r));
  const list = Array.from(byKey.values());
  for (let i = 0; i < list.length; i += SYNC.UPSERT_BATCH) {
    supaFetch_('post', table + '?on_conflict=' + keyCols.join(','), list.slice(i, i + SYNC.UPSERT_BATCH),
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
  }
}

function supaGet_(path) { return supaFetch_('get', path) || []; }
function supaPatch_(path, body) { return supaFetch_('patch', path, body, { Prefer: 'return=minimal' }); }

/** Every value of one column matching a filter, 1,000 rows at a time. */
function supaSelectIds_(table, col, filter) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = supaGet_(table + '?select=' + col + '&' + filter + '&order=' + col + '&limit=1000&offset=' + offset);
    rows.forEach(r => out.push(Number(r[col])));
    if (rows.length < 1000) return out;
  }
}

function logRun_(startedIso, ran, errors) {
  try {
    supaFetch_('post', 'fr_sync_runs', [{
      started_at: startedIso, finished_at: new Date().toISOString(), steps: ran,
      api_calls: CALLS, ok: errors.length === 0, errors: errors.length ? errors.join(' | ').slice(0, 4000) : null
    }], { Prefer: 'return=minimal' });
  } catch (e) {
    console.log('Could not log the run: ' + e.message);
  }
}

/* ======================================================================
 * Value helpers
 * ====================================================================== */

function str_(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function num_(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function id_(v) { const n = num_(v); return n && n > 0 ? n : null; }
function bool_(v) { return v === true || String(v).trim() === '1' || /^(true|yes)$/i.test(String(v).trim()); }
function first_(obj, keys) {
  for (let i = 0; i < keys.length; i++) if (obj[keys[i]] !== undefined && obj[keys[i]] !== null && obj[keys[i]] !== '') return obj[keys[i]];
  return null;
}
function idList_(v) {
  const list = Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).split(/[^0-9]+/);
  const out = list.map(Number).filter(n => n > 0);
  return out.length ? out : null;
}
/** "2026-11-13" from any FieldRoutes date or date-time; null for blanks and 0000-00-00. */
function day_(v) {
  const s = String(v === undefined || v === null ? '' : v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== '0000-00-00' ? s : null;
}
/** FieldRoutes Pacific date-time → ISO timestamp. */
function ts_(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!s || /^0000/.test(s)) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Utilities.parseDate(s, SYNC.API_TZ, 'yyyy-MM-dd').toISOString();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2})?/.test(s)) {
      const clean = s.replace('T', ' ').slice(0, 19);
      return Utilities.parseDate(clean.length === 16 ? clean + ':00' : clean, SYNC.API_TZ, 'yyyy-MM-dd H:mm:ss').toISOString();
    }
  } catch (e) {}
  return null;
}
/** "9:30" / "09:30:00" → "09:30:00". */
function time_(v) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v === undefined || v === null ? '' : v).trim());
  if (!m) return null;
  return ('0' + m[1]).slice(-2) + ':' + m[2] + ':' + (m[3] || '00');
}

function ymd_(d) { return Utilities.formatDate(d, SYNC.TZ, 'yyyy-MM-dd'); }
function nowPacific_() { return Utilities.formatDate(new Date(), SYNC.API_TZ, 'yyyy-MM-dd HH:mm:ss'); }
function minusMinutesPacific_(pacific, minutes) {
  const d = Utilities.parseDate(pacific, SYNC.API_TZ, 'yyyy-MM-dd HH:mm:ss');
  return Utilities.formatDate(new Date(d.getTime() - minutes * 60000), SYNC.API_TZ, 'yyyy-MM-dd HH:mm:ss');
}
function addDays_(ymd, n) {
  const p = ymd.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
function addMonths_(firstOfMonth, n) {
  const p = firstOfMonth.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1 + n, 1)).toISOString().slice(0, 10);
}
function monthEnd_(firstOfMonth) { return addDays_(addMonths_(firstOfMonth, 1), -1); }
/** [[first, last], …] for each calendar month from `from` through `to`. */
function months_(from, to) {
  const out = [];
  let m = from.slice(0, 8) + '01';
  while (m <= to) {
    const end = monthEnd_(m);
    out.push([m < from ? from : m, end > to ? to : end]);
    m = addMonths_(m, 1);
  }
  return out;
}

/* ======================================================================
 * Checks (run from the editor; results in the Execution log)
 * ====================================================================== */

/** Checks every FieldRoutes key and the Supabase connection. Changes nothing. */
function testConnections() {
  SYNC.OFFICES.forEach(o => {
    try {
      const body = frCall_(o, 'employee/search', { active: 1 });
      Logger.log('✅ FieldRoutes ' + o.key + ': connected (' + (body.employeeIDs || []).length + ' active employees)');
    } catch (e) { Logger.log('❌ FieldRoutes ' + o.key + ': ' + e.message); }
  });
  try {
    const offices = supaGet_('offices?select=key,fr_office_id');
    Logger.log('✅ Supabase: connected (' + offices.map(r => r.key + (r.fr_office_id ? ' #' + r.fr_office_id : '')).join(', ') + ')');
    supaGet_('fr_sync_runs?select=id&limit=1');
    Logger.log('✅ Supabase: FieldRoutes copy tables exist');
  } catch (e) { Logger.log('❌ Supabase: ' + e.message); }
  try { Logger.log('Office IDs: ' + JSON.stringify(officeIds_())); } catch (e) { Logger.log('❌ Office IDs: ' + e.message); }
  Logger.log('FieldRoutes calls used by this check: ' + CALLS);
}

/** Logs the field NAMES FieldRoutes sends for each kind of record (never the values). Changes nothing. */
function inspectFields() {
  const o = SYNC.OFFICES[0];
  const today = ymd_(new Date());
  const weekAgo = addDays_(today, -7);
  [
    ['appointment', { date: { operator: 'BETWEEN', value: [weekAgo, today] } }],
    ['subscription', { dateUpdated: { operator: '>=', value: weekAgo } }],
    ['customer', { dateUpdated: { operator: '>=', value: weekAgo } }],
    ['door', { dateUpdated: { operator: '>=', value: weekAgo + ' 00:00:00' } }],
    ['review', { date: { operator: 'BETWEEN', value: [weekAgo + ' 00:00:00', today + ' 23:59:59'] } }],
    ['employee', { active: 1 }],
    ['serviceType', {}]
  ].forEach(([entity, params]) => {
    try {
      const recs = frFetch_(o, entity, params).slice(0, 50);
      const keys = Object.keys(recs.reduce((a, r) => Object.assign(a, r), {}));
      Logger.log('✅ ' + entity + ': ' + recs.length + ' sampled. Fields: ' + keys.join(', '));
    } catch (e) { Logger.log('❌ ' + entity + ': ' + e.message); }
  });
  Logger.log('FieldRoutes calls used: ' + CALLS);
}
