// Change 81: the truck sheet keeps Samsara in step. Server only (secret-key Supabase client + SAMSARA_API_TOKEN).
// Per truck, matched by VIN: Samsara name "Adin Sanford -118" (the team's format; Procare Sync matches techs to trucks
// by it), plate, the office tag (other tags kept), and "SOLD -123" + a note when it leaves the fleet. The driver goes to
// tech_vehicles (manual) so the scorecard follows right away and Procare Sync pins their Samsara driver to the truck.
// Never creates or deletes anything in Samsara.
import { OFFICE_NAME } from './labels';
import { usDate } from './trucks';

const BASE = 'https://api.samsara.com';
export const samsaraConfigured = () => !!process.env.SAMSARA_API_TOKEN;

async function ss(path, { method = 'GET', body } = {}) {
  const token = String(process.env.SAMSARA_API_TOKEN || '').trim();
  if (!token) throw new Error('SAMSARA_API_TOKEN isn’t set in Vercel yet.');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(`${BASE}${path}`, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 800 * attempt)); continue; }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(`Samsara refused (${res.status}): the token needs Read and Write Vehicles and Read Tags.`);
    if (!res.ok) throw new Error(`Samsara said (${res.status}): ${json.message || json.error || res.statusText}`);
    return json;
  }
  throw new Error('Samsara kept saying it was busy; try again in a minute.');
}

async function all(path) {
  let after = '', out = [];
  do {
    const r = await ss(`${path}${path.includes('?') ? '&' : '?'}limit=512${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    out = out.concat(r.data || []);
    after = r.pagination?.hasNextPage ? r.pagination.endCursor : '';
  } while (after);
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** What Samsara should say for this truck. */
export function wanted(t, driverName, officeTagIds, currentTags, currentNotes) {
  const no = t.truck_no ? `-${t.truck_no}` : `-${(t.vin || '').slice(-3)}`;
  const gone = t.status === 'sold' || t.status === 'gone';
  const who = driverName || t.driver_note || 'No Driver';
  const name = gone ? `${t.status === 'sold' ? 'SOLD' : 'OFF FLEET'} ${no} ${[t.year, t.model].filter(Boolean).join(' ')}`.trim() : `${who} ${no}`;
  const plate = t.plate && !/temp/i.test(t.plate) ? t.plate.slice(0, 12) : null;
  const officeTag = officeTagIds[t.office] || null;
  const otherOffices = new Set(Object.values(officeTagIds));
  const keep = (currentTags || []).map((x) => String(x.id)).filter((id) => !otherOffices.has(id));
  const tagIds = gone ? keep : [...keep, ...(officeTag ? [officeTag] : [])];
  const note = gone ? `${t.status === 'sold' ? 'Sold' : 'Off the fleet'} ${usDate(t.removed_on)} (Procare app).` : null;
  return {
    name: name.slice(0, 255), plate, tagIds,
    notes: note && !String(currentNotes || '').startsWith(note) ? `${note} ${currentNotes || ''}`.trim().slice(0, 255) : null,
  };
}

/** Samsara tags named for each office ("Atlanta East", "East", "Eastside"…): office key → tag id. */
function officeTags(tags) {
  const out = {};
  for (const [key, name] of Object.entries(OFFICE_NAME)) {
    const short = name.replace(/^Atlanta\s+/i, '');
    const hit = tags.find((g) => [norm(name), norm(short), norm(`${short}side`)].includes(norm(g.name)));
    if (hit) out[key] = String(hit.id);
  }
  return out;
}

/**
 * Work out (and with apply, make) the Samsara changes for some trucks (ids) or every truck.
 * Returns { lines, changed, missing, problems }.
 */
export async function syncSamsara(admin, { ids = null, apply = false } = {}) {
  const [vehicles, tags] = await Promise.all([all('/fleet/vehicles'), all('/tags').catch(() => [])]);
  const officeTagIds = officeTags(tags);
  const byId = Object.fromEntries(vehicles.map((v) => [String(v.id), v]));
  const byVin = Object.fromEntries(vehicles.filter((v) => v.vin).map((v) => [String(v.vin).toUpperCase(), v]));

  let q = admin.from('trucks').select('*');
  if (ids) q = q.in('id', ids);
  const { data: trucks } = await q;
  const driverIds = [...new Set((trucks || []).map((t) => t.driver_id).filter(Boolean))];
  const { data: people } = driverIds.length ? await admin.from('employees').select('id, first_name, last_name, department').in('id', driverIds) : { data: [] };
  const person = Object.fromEntries((people || []).map((p) => [p.id, p]));

  const lines = [], problems = [], missing = [];
  let changed = 0;
  const now = new Date().toISOString();
  if (Object.keys(officeTagIds).length < 3) {
    const have = Object.keys(officeTagIds).map((k) => OFFICE_NAME[k]);
    lines.push(`Office tags: ${have.length ? `found ${have.join(', ')}` : 'none found'}. Make a tag named for each office in Samsara (Settings → Tags, e.g. "Atlanta East") and the next push adds it.`);
  }

  for (const t of trucks || []) {
    const v = (t.samsara_vehicle_id && byId[t.samsara_vehicle_id]) || (t.vin && byVin[String(t.vin).toUpperCase()]) || null;
    if (!v) {
      if (t.status === 'active' || t.status === 'for_sale') missing.push(t.truck_no || t.vin);
      if (apply) await admin.from('trucks').update({ samsara_result: 'Not in Samsara yet (it shows up when the camera is installed; matched by VIN).' }).eq('id', t.id);
      continue;
    }
    const p = t.driver_id ? person[t.driver_id] : null;
    const want = wanted(t, p ? `${p.first_name} ${p.last_name}`.trim() : null, officeTagIds, v.tags, v.notes);
    const patch = {};
    if (want.name !== v.name) patch.name = want.name;
    if (want.plate && want.plate !== v.licensePlate) patch.licensePlate = want.plate;
    const curTags = (v.tags || []).map((x) => String(x.id)).sort().join(',');
    if ([...want.tagIds].sort().join(',') !== curTags) patch.tagIds = want.tagIds;
    if (want.notes) patch.notes = want.notes;
    const label = `Truck ${t.truck_no || t.vin}`;
    if (Object.keys(patch).length) {
      const what = [patch.name && `name "${v.name}" → "${patch.name}"`, patch.licensePlate && `plate ${v.licensePlate || '–'} → ${patch.licensePlate}`,
        patch.tagIds && 'office tag', patch.notes && 'sold note'].filter(Boolean).join(', ');
      lines.push(`${label}: ${what}`);
    }
    if (!apply) continue;
    try {
      if (Object.keys(patch).length) { await ss(`/fleet/vehicles/${v.id}`, { method: 'PATCH', body: patch }); changed += 1; }
      await admin.from('trucks').update({ samsara_vehicle_id: String(v.id), samsara_name: patch.name || v.name, samsara_pushed_at: now, samsara_result: null }).eq('id', t.id);
      // The scorecard and Procare Sync's driver run follow the truck sheet
      if (p && p.department === 'technician' && (t.status === 'active' || t.status === 'for_sale')) {
        await admin.from('tech_vehicles').update({ vehicle_id: null, vehicle_name: null, set_by: 'auto', updated_at: now }).eq('vehicle_id', String(v.id)).neq('employee_id', p.id);
        await admin.from('tech_vehicles').upsert({ employee_id: p.id, vehicle_id: String(v.id), vehicle_name: patch.name || v.name, set_by: 'manual', updated_at: now }, { onConflict: 'employee_id' });
      }
      if (t.status === 'sold' || t.status === 'gone') {
        await admin.from('tech_vehicles').update({ vehicle_id: null, vehicle_name: null, set_by: 'auto', updated_at: now }).eq('vehicle_id', String(v.id));
      }
    } catch (e) {
      problems.push(`${label}: ${e.message}`);
      await admin.from('trucks').update({ samsara_result: String(e.message).slice(0, 300) }).eq('id', t.id);
    }
  }
  if (missing.length) lines.push(`Not in Samsara (no vehicle with that VIN): ${missing.join(', ')}`);
  return { lines, changed, missing, problems };
}
