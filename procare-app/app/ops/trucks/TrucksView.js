'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { SERVICE } from '@/lib/maintenance';
import { DOC_KIND, LOG_KIND, MONTHS, ON_SHEET, STATUS, dollars, fleetTotals, monthsLeft, openLoan, truckName, usDate } from '@/lib/trucks';
import Toggle from '../../Toggle';
import Picker from '../../Picker';

const rpc = (name, args) => createClient().rpc(name, args);
const last6 = (vin) => (vin ? vin.slice(-6) : '');

/** Tell Samsara about a change on the sheet (change 81). The server does nothing while the push is off. */
async function nudgeSamsara(truckId) {
  try {
    const res = await fetch('/api/samsara', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push', truck: truckId }) });
    const j = await res.json().catch(() => ({}));
    return j.skipped || j.ok ? null : (j.problems || []).join(' ') || j.text || null;
  } catch { return null; }
}

/** Sends the insurance + bookkeeper emails for an added / removed truck. Returns the message to show. */
async function sendNotice(id) {
  const res = await fetch('/api/fleet-notice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  const j = await res.json().catch(() => ({}));
  return { ok: !!j.ok, text: j.message || `Email error ${res.status}` };
}

function Field({ label, children, wide = false }) {
  return <label className={`tr-field${wide ? ' tr-wide' : ''}`}><span>{label}</span>{children}</label>;
}

function Msg({ m }) {
  if (!m) return null;
  return <p className={m.ok ? 'ok' : 'error'} role="status">{m.text}</p>;
}

/* ---------- Details (managers and up: the truck sheet; C-Suite: money too, change 80) ---------- */
const EVERYDAY = [
  ['vin', 'VIN'], ['truck_no', 'Truck #'], ['year', 'Year'], ['make', 'Make'], ['model', 'Model'], ['plate', 'Tag'], ['county', 'County'],
  ['insurer', 'Insurance'], ['gas_card', 'Gas card'], ['toolbox', 'Toolbox'], ['key_tag', 'Key'], ['peach_pass', 'Peach Pass'], ['mileage', 'Miles'], ['insurance_yearly', 'Insurance a year ($)'],
];
const MONEY = [['bought_on', 'Bought on'], ['purchase_price', 'Purchase price ($)'], ['value', 'Value today ($)']];

function blank(t) {
  const f = {};
  for (const [k] of [...EVERYDAY, ...MONEY]) f[k] = t?.[k] ?? '';
  f.tag_month = t?.tag_month || '';
  f.samsara = !!t?.samsara;
  f.notes = t?.notes || '';
  return f;
}

function DetailsForm({ f, set, money, isNew }) {
  return (
    <div className="tr-grid">
      {EVERYDAY.map(([k, label]) => (
        <Field key={k} label={label} wide={k === 'vin' && isNew}>
          <input value={f[k]} maxLength={k === 'vin' ? 17 : undefined} inputMode={['year', 'mileage', 'insurance_yearly'].includes(k) ? (k === 'insurance_yearly' ? 'decimal' : 'numeric') : undefined}
            onChange={(e) => set({ [k]: k === 'vin' ? e.target.value.toUpperCase() : e.target.value })} />
        </Field>
      ))}
      <Field label="Tag renews">
        <Picker label="Tag renews" value={f.tag_month} placeholder="Month…" options={[{ value: '', label: '(not set)' }, ...MONTHS.map((m) => ({ value: m, label: m }))]} onChange={(v) => set({ tag_month: v })} />
      </Field>
      {money && MONEY.map(([k, label]) => (
        <Field key={k} label={label}>
          <input type={['bought_on'].includes(k) ? 'date' : 'text'} inputMode={k === 'bought_on' ? undefined : 'decimal'} value={f[k]}
            onChange={(e) => set({ [k]: e.target.value })} />
        </Field>
      ))}
      <Field label="Notes" wide><textarea rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="tr-wide"><Toggle checked={f.samsara} onChange={(on) => set({ samsara: on })}><span>Samsara camera installed</span></Toggle></div>
    </div>
  );
}

const clean = (f, money) => {
  const out = {};
  for (const [k] of EVERYDAY) {
    const v = String(f[k] ?? '');
    out[k] = k === 'vin' ? v.replace(/\s/g, '').toUpperCase() : k === 'insurance_yearly' ? v.replace(/[$,\s]/g, '') : v.replace(/,/g, k === 'mileage' ? '' : ',').trim();
  }
  out.tag_month = f.tag_month;
  out.samsara = f.samsara;
  out.notes = f.notes;
  if (money) for (const [k] of MONEY) out[k] = String(f[k] ?? '').replace(k === 'bought_on' ? /\s/g : /[$,\s]/g, '');
  return out;
};

/* ---------- Loans (C-Suite) ---------- */
const LOAN_FIELDS = [['lender', 'Lender', 'text'], ['payment', 'Monthly payment ($)', 'decimal'], ['start_on', 'Start', 'date'], ['end_on', 'End', 'date'],
  ['financed', 'Financed ($)', 'decimal'], ['rate', 'Interest (%)', 'decimal'], ['balance', 'Balance today ($)', 'decimal']];

function LoanForm({ truck, loan, onDone }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({ ...Object.fromEntries(LOAN_FIELDS.map(([k]) => [k, loan?.[k] ?? ''])), paid_off: !!loan?.paid_off, notes: loan?.notes || '' }));
  const [m, setM] = useState(null);
  const save = async (del = false) => {
    if (del && !window.confirm('Delete this loan from the truck?')) return;
    const p = { ...f };
    for (const k of ['payment', 'financed', 'rate', 'balance']) p[k] = String(p[k] ?? '').replace(/[$,%\s]/g, '');
    const { error } = await rpc('save_truck_loan', { p_truck: truck.id, p_loan: loan?.id || null, p, p_delete: del });
    if (error) { setM({ ok: false, text: error.message }); return; }
    onDone?.();
    router.refresh();
  };
  return (
    <div className="tr-loan-form">
      <div className="tr-grid">
        {LOAN_FIELDS.map(([k, label, type]) => (
          <Field key={k} label={label}>
            <input type={type === 'date' ? 'date' : 'text'} inputMode={type === 'decimal' ? 'decimal' : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </Field>
        ))}
        <Field label="Notes" wide><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="No account numbers here" /></Field>
        <div className="tr-wide"><Toggle checked={f.paid_off} onChange={(on) => setF({ ...f, paid_off: on })}><span>Paid off</span></Toggle></div>
      </div>
      <div className="panel-buttons">
        <button type="button" className="btn btn-small" onClick={() => save(false)}>Save loan</button>
        {loan && <button type="button" className="btn btn-small btn-quiet" onClick={() => save(true)}>Delete</button>}
        <button type="button" className="btn btn-small btn-quiet" onClick={onDone}>Cancel</button>
      </div>
      <Msg m={m} />
    </div>
  );
}

function Loans({ t, today }) {
  const [editing, setEditing] = useState(null);   // loan id, 'new' or null
  return (
    <section className="tr-sec">
      <h3>Loan</h3>
      {(t.loans || []).length === 0 && editing !== 'new' && <p className="note">No loan on file (paid in cash or paid off).</p>}
      {(t.loans || []).map((l) => editing === l.id ? <LoanForm key={l.id} truck={t} loan={l} onDone={() => setEditing(null)} /> : (
        <div key={l.id} className="tr-loan">
          <p><b>{l.lender || 'Lender not set'}</b>{l.paid_off ? ' · paid off' : ''}</p>
          <p className="note">
            {dollars(l.payment, true)} a month{l.rate !== null && l.rate !== undefined ? ` · ${Number(l.rate)}%` : ''}
            {l.start_on ? ` · ${usDate(l.start_on)} to ${usDate(l.end_on)}` : ''}
            {!l.paid_off && l.end_on ? ` · ${monthsLeft(l, today)} months left` : ''}
          </p>
          <p className="note">Financed {dollars(l.financed, true)} · balance {dollars(l.balance, true)}{l.balance_on ? ` on ${usDate(l.balance_on)}` : ''}</p>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => setEditing(l.id)}>Edit</button>
        </div>
      ))}
      {editing === 'new' ? <LoanForm truck={t} onDone={() => setEditing(null)} /> : <button type="button" className="btn btn-small btn-quiet" onClick={() => setEditing('new')}>Add a loan</button>}
    </section>
  );
}

/* ---------- Status: for sale, sold, off the fleet, back on (C-Suite) ---------- */
function Status({ t, today, settings }) {
  const router = useRouter();
  const [f, setF] = useState({ how: 'sold', day: today, price: '', to: '', reason: '', email: true });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  const who = [settings?.insurance_name, settings?.bookkeeper_name].filter(Boolean).map((x) => x.split(' ')[0]).join(' and ') || 'insurance and the bookkeeper';

  const set = async (status, extra = {}) => {
    setBusy(true); setM(null);
    const { data: ev, error } = await rpc('set_truck_status', { p_truck: t.id, p_status: status, p_day: extra.day || today, p_price: extra.price || null, p_to: extra.to || null, p_reason: extra.reason || null });
    if (error) { setBusy(false); setM({ ok: false, text: error.message }); return; }
    let note = null;
    if (ev && extra.email) note = await sendNotice(ev);
    const ss = await nudgeSamsara(t.id);
    setBusy(false);
    setM(ss ? { ok: false, text: `${note?.text || 'Saved'} · Samsara: ${ss}` } : note || { ok: true, text: 'Saved.' });
    setOpen(false);
    router.refresh();
  };

  if (!ON_SHEET(t)) {
    return (
      <section className="tr-sec">
        <h3>{STATUS[t.status].label}</h3>
        <p className="note">{usDate(t.removed_on)}{t.sold_price ? ` · ${dollars(t.sold_price, true)}` : ''}{t.sold_to ? ` · to ${t.sold_to}` : ''}{t.removed_reason ? ` · ${t.removed_reason}` : ''}</p>
        <div className="panel-buttons"><button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => window.confirm('Put this truck back on the sheet? (No email goes out.)') && set('active')}>Put back on the fleet</button></div>
        <Msg m={m} />
      </section>
    );
  }
  return (
    <section className="tr-sec">
      <h3>Status</h3>
      <Toggle checked={t.status === 'for_sale'} disabled={busy} onChange={(on) => set(on ? 'for_sale' : 'active')}><span>For sale</span></Toggle>
      {!open ? (
        <div className="panel-buttons"><button type="button" className="btn btn-small" onClick={() => setOpen(true)}>Sold or off the fleet…</button></div>
      ) : (
        <div className="tr-sold">
          <div className="chips">
            <button type="button" className={`chip${f.how === 'sold' ? ' on' : ''}`} onClick={() => setF({ ...f, how: 'sold' })}>Sold</button>
            <button type="button" className={`chip${f.how === 'gone' ? ' on' : ''}`} onClick={() => setF({ ...f, how: 'gone' })}>Totaled, returned or other</button>
          </div>
          <div className="tr-grid">
            <Field label="Date"><input type="date" value={f.day} max={today} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
            {f.how === 'sold' && <Field label="Sold for ($)"><input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>}
            {f.how === 'sold' && <Field label="Sold to (optional)"><input value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>}
            {f.how === 'gone' && <Field label="What happened" wide><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Totaled, lease returned, ..." /></Field>}
          </div>
          <Toggle checked={f.email} onChange={(on) => setF({ ...f, email: on })}>
            <span>Email {who}</span>
            <span className="note">{f.email ? 'Insurance: take it off the policy. Bookkeeper: record the sale and the loan payoff (a bill of sale uploaded under Documents first goes with it).' : 'No email; you can send it later from the truck’s history.'}</span>
          </Toggle>
          <div className="panel-buttons">
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => {
              const price = String(f.price).replace(/[$,\s]/g, '');
              if (f.how === 'sold' && !price) { setM({ ok: false, text: 'Put in what it sold for.' }); return; }
              set(f.how, { day: f.day, price: price ? Number(price) : null, to: f.to, reason: f.reason, email: f.email });
            }}>{busy ? 'Saving…' : 'Take it off the sheet'}</button>
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      <Msg m={m} />
    </section>
  );
}

/* ---------- History: notes, maintenance, changes ---------- */
function Log({ t, today, money }) {
  const router = useRouter();
  const [f, setF] = useState({ kind: 'maintenance', service: 'oil', day: today, text: '', cost: '', miles: '' });
  const [m, setM] = useState(null);
  const [sending, setSending] = useState(null);
  const add = async () => {
    const { error } = await rpc('add_truck_log', {
      p_truck: t.id, p_kind: f.kind, p_day: f.day, p_text: f.text,
      p_cost: f.cost ? Number(String(f.cost).replace(/[$,\s]/g, '')) : null, p_miles: f.miles ? Number(String(f.miles).replace(/[,\s]/g, '')) : null,
      p_service: f.kind === 'maintenance' ? f.service : null,
    });
    if (error) { setM({ ok: false, text: error.message }); return; }
    setF({ ...f, text: '', cost: '', miles: '' }); setM(null);
    router.refresh();
  };
  const del = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    const { error } = await rpc('delete_truck_log', { p_id: id });
    if (error) setM({ ok: false, text: error.message }); else router.refresh();
  };
  const resend = async (id) => {
    setSending(id);
    setM(await sendNotice(id));
    setSending(null);
    router.refresh();
  };
  return (
    <section className="tr-sec tr-log">
      <h3>Notes &amp; maintenance</h3>
      <div className="chips">
        {['maintenance', 'note'].map((k) => <button key={k} type="button" className={`chip${f.kind === k ? ' on' : ''}`} onClick={() => setF({ ...f, kind: k })}>{LOG_KIND[k]}</button>)}
      </div>
      {f.kind === 'maintenance' && <div className="chips">
        {Object.entries(SERVICE).map(([k, label]) => <button key={k} type="button" className={`chip${f.service === k ? ' on' : ''}`} onClick={() => setF({ ...f, service: k })}>{label}</button>)}
      </div>}
      <div className="tr-grid">
        <Field label="Date"><input type="date" value={f.day} max={today} onChange={(e) => setF({ ...f, day: e.target.value })} /></Field>
        {f.kind === 'maintenance' && <Field label="Cost ($)"><input inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>}
        <Field label="Miles"><input inputMode="numeric" value={f.miles} onChange={(e) => setF({ ...f, miles: e.target.value })} /></Field>
        <Field label={f.kind === 'maintenance' ? 'What was done' : 'Note'} wide>
          <textarea rows={2} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={f.kind === 'maintenance' ? 'Shop, parts, anything to remember (optional)' : ''} />
        </Field>
      </div>
      <div className="panel-buttons"><button type="button" className="btn btn-small" onClick={add}>Add</button></div>
      <Msg m={m} />
      {(t.log || []).length > 0 && (
        <ul className="tr-entries">
          {t.log.map((g) => (
            <li key={g.id}>
              <span className={`pill tr-kind-${g.kind}`}>{LOG_KIND[g.kind] || g.kind}</span>
              <span className="tr-entry-main">
                <b>{usDate(g.day)}</b> {g.text}
                {g.cost ? ` · ${dollars(g.cost, true)}` : ''}{g.miles ? ` · ${Number(g.miles).toLocaleString('en-US')} mi` : ''}
                {g.by ? <span className="note"> · {g.by}</span> : null}
                {(g.kind === 'added' || g.kind === 'removed') && (
                  <span className="tr-email">
                    {g.emailed_at ? <span className="note">Emailed {usDate(g.emailed_at.slice(0, 10))}</span>
                      : <>{g.email_result && <span className="error">{g.email_result}</span>}
                          <button type="button" className="btn btn-small btn-quiet" disabled={sending === g.id} onClick={() => resend(g.id)}>{sending === g.id ? 'Sending…' : 'Email insurance & bookkeeper'}</button></>}
                  </span>
                )}
              </span>
              {(g.kind === 'note' || g.kind === 'maintenance') && <button type="button" className="tr-x" aria-label="Delete entry" onClick={() => del(g.id)}>×</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Documents: agreements, title, bill of sale (C-Suite, change 77) ---------- */
const post = async (body) => {
  const res = await fetch('/api/truck-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
  return j;
};

/** Phone photos: turned into a JPEG no bigger than 2400px (smaller emails; iPhone HEIC photos become JPEG). */
async function shrink(file) {
  const img = file.type.startsWith('image/');
  if (!img || ((file.type === 'image/jpeg' || file.type === 'image/png') && file.size < 1.5e6)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/** Upload one file to a truck (straight to storage), save it and send it to QuickBooks. Returns the QuickBooks result. */
async function uploadDoc(truckId, raw, kind) {
  const file = await shrink(raw);
  const start = await post({ action: 'start', truck: truckId, name: file.name });
  const { error } = await createClient().storage.from('truck-docs').uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  const done = await post({ action: 'done', truck: truckId, path: start.path, name: file.name, kind, size: file.size, mime: file.type });
  return done.qbo || { ok: true, text: 'Saved' };
}

function Documents({ t }) {
  const router = useRouter();
  const [kind, setKind] = useState('finance');
  const [busy, setBusy] = useState('');
  const [m, setM] = useState(null);
  const upload = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    for (const raw of picked) {
      setM(null);
      try {
        setBusy(`Uploading ${raw.name}…`);
        const q = await uploadDoc(t.id, raw, kind);
        setM({ ok: q.ok !== false, text: q.ok ? `Saved. ${q.text}.` : q.text });
      } catch (err) {
        setM({ ok: false, text: String(err.message || err) });
      }
    }
    setBusy('');
    router.refresh();
  };
  const act = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy('Working…'); setM(null);
    try {
      const j = await post(body);
      if (j.qbo) setM({ ok: j.qbo.ok, text: j.qbo.text });
    } catch (err) { setM({ ok: false, text: String(err.message || err) }); }
    setBusy('');
    router.refresh();
  };
  return (
    <section className="tr-sec">
      <h3>Documents</h3>
      {(t.documents || []).length === 0 && <p className="note">No paperwork yet. Agreements go to the bookkeeper with the email and into QuickBooks.</p>}
      {(t.documents || []).length > 0 && (
        <ul className="tr-entries">
          {t.documents.map((d) => (
            <li key={d.id}>
              <span className="pill">{DOC_KIND[d.kind]?.label || d.kind}</span>
              <span className="tr-entry-main">
                <a href={`/api/truck-doc?id=${d.id}`} target="_blank" rel="noreferrer">{d.name}</a>
                <span className="note"> · {usDate(d.created_at.slice(0, 10))}</span>
                <span className="tr-email">
                  {d.qbo_attachable_id ? <span className="note">{d.qbo_result || 'In QuickBooks'}</span> : (
                    <>{d.qbo_result && <span className="error">{d.qbo_result}</span>}
                      <button type="button" className="btn btn-small btn-quiet" disabled={!!busy} onClick={() => act({ action: 'qbo', id: d.id })}>Send to QuickBooks</button></>
                  )}
                </span>
              </span>
              <button type="button" className="tr-x" aria-label="Delete document" disabled={!!busy}
                onClick={() => act({ action: 'delete', id: d.id }, `Delete ${d.name} from the app? (A copy already in QuickBooks stays there.)`)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="chips">
        {Object.entries(DOC_KIND).map(([k, v]) => <button key={k} type="button" className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{v.label}</button>)}
      </div>
      <label className={`btn btn-small tr-upload${busy ? ' disabled' : ''}`}>
        {busy || `Upload ${DOC_KIND[kind].label.toLowerCase()}`}
        <input type="file" accept="image/*,application/pdf" multiple disabled={!!busy} onChange={upload} hidden />
      </label>
      <p className="note">A photo or a PDF. Only C-Suite can open these.</p>
      <Msg m={m} />
    </section>
  );
}

/* ---------- One truck, opened ---------- */
function TruckCard({ t, people, money, today, settings, samsara }) {
  const router = useRouter();
  const [f, setF] = useState(() => blank(t));
  const [driver, setDriver] = useState({ id: t.driver_id || '', note: t.driver_note || '' });
  const [m, setM] = useState(null);
  const options = useMemo(() => [{ value: '', label: 'No driver' }, ...people.map((p) => ({ value: p.id, label: p.name, group: OFFICE_NAME[p.office] || 'No office' }))], [people]);

  const saveDriver = async (id, note) => {
    setDriver({ id, note });
    const { error } = await rpc('set_truck_driver', { p_truck: t.id, p_driver: id || null, p_note: note });
    if (error) { setM({ ok: false, text: error.message }); return; }
    await synced();
  };
  const move = async (office) => {
    const { error } = await rpc('move_truck', { p_truck: t.id, p_office: office });
    if (error) { setM({ ok: false, text: error.message }); return; }
    await synced();
  };
  const save = async () => {
    const { error } = await rpc('save_truck', { p_id: t.id, p: clean(f, money) });
    if (error) { setM({ ok: false, text: error.message }); return; }
    await synced('Saved.');
  };
  // After a change: Samsara (when the push is on), then reload the sheet
  const synced = async (okText = null) => {
    const ss = await nudgeSamsara(t.id);
    setM(ss ? { ok: false, text: `Saved here, but Samsara: ${ss}` } : okText ? { ok: true, text: okText } : null);
    router.refresh();
  };

  return (
    <div className="tr-card">
      <section className="tr-sec">
        <h3>Driver &amp; office</h3>
        <div className="tr-grid">
          <Field label="Driver"><Picker label="Driver" value={driver.id} options={options} placeholder="No driver" onChange={(v) => saveDriver(v, v ? '' : driver.note)} /></Field>
          {!driver.id && (
            <Field label="If no driver, why">
              <input value={driver.note} onChange={(e) => setDriver({ ...driver, note: e.target.value })} onBlur={() => driver.note !== (t.driver_note || '') && saveDriver('', driver.note)} placeholder="Spare, body shop, liquids rig, ..." />
            </Field>
          )}
        </div>
        <div className="chips tr-offices">
          {OFFICES.map((o) => <button key={o.key} type="button" className={`chip${t.office === o.key ? ' on' : ''}`} onClick={() => move(o.key)}>{o.name}</button>)}
        </div>
      </section>

      <section className="tr-sec">
        <h3>Details</h3>
        <p className="note tr-ss">Samsara: {samsara?.vehicle_id ? `“${samsara.name}”` : 'not matched yet'}{samsara?.pushed_at ? ` · updated ${usDate(samsara.pushed_at.slice(0, 10))}` : ''}
          {samsara?.result ? <span className="error"> · {samsara.result}</span> : null}</p>
        <DetailsForm f={f} set={(patch) => setF({ ...f, ...patch })} money={money} />
        <div className="panel-buttons"><button type="button" className="btn btn-small" onClick={save}>Save details</button></div>
        <Msg m={m} />
      </section>

      {money && <Documents t={t} />}
      {money && <Loans t={t} today={today} />}
      <Status t={t} today={today} settings={settings} />
      <Log t={t} today={today} money={money} />
    </div>
  );
}

/* ---------- Add a truck (C-Suite) ---------- */
function AddTruck({ today, settings, onClose, money }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({ ...blank(null), make: 'Nissan', model: 'Frontier', year: today.slice(0, 4), bought_on: today, office: '' }));
  const [loan, setLoan] = useState({ on: false, lender: '', payment: '', start_on: today, end_on: '', financed: '', rate: '' });
  const [email, setEmail] = useState(true);
  const [papers, setPapers] = useState({ purchase: null, finance: null });
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  const who = [settings?.insurance_name, settings?.bookkeeper_name].filter(Boolean).map((x) => x.split(' ')[0]).join(' and ') || 'insurance and the bookkeeper';

  const add = async () => {
    setM(null);
    const vin = f.vin.replace(/\s/g, '');
    if (vin.length !== 17) { setM({ ok: false, text: `A VIN is 17 characters (this one has ${vin.length}).` }); return; }
    if (!f.office) { setM({ ok: false, text: 'Pick the office.' }); return; }
    setBusy(true);
    const { data, error } = await rpc('save_truck', { p_id: null, p: { ...clean(f, money), office: f.office } });
    if (error) { setBusy(false); setM({ ok: false, text: /duplicate|unique/i.test(error.message) ? 'That VIN is already on the sheet.' : error.message }); return; }
    if (money && loan.on) {
      const p = { ...loan, balance: loan.financed, balance_on: loan.start_on };
      for (const k of ['payment', 'financed', 'rate', 'balance']) p[k] = String(p[k] ?? '').replace(/[$,%\s]/g, '');
      await rpc('save_truck_loan', { p_truck: data.id, p_loan: null, p, p_delete: false });
    }
    // The paperwork first, so the bookkeeper's email has it attached
    const problems = [];
    for (const [kind, file] of Object.entries(money ? papers : {})) {
      if (!file) continue;
      try {
        const q = await uploadDoc(data.id, file, kind);
        if (q.ok === false) problems.push(q.text);
      } catch (err) { problems.push(`${kind === 'purchase' ? 'Purchase' : 'Finance'} agreement didn’t upload: ${err.message}`); }
    }
    let note = null;
    if (email && data?.event) note = await sendNotice(data.event);
    await nudgeSamsara(data.id);
    setBusy(false);
    setM(problems.length ? { ok: false, text: [note?.text, ...problems].filter(Boolean).join(' · ') } : note || { ok: true, text: 'Added.' });
    router.refresh();
    if (!note || note.ok) onClose();
  };

  return (
    <section className="panel tr-add">
      <h2>Add a truck</h2>
      <Field label="Office">
        <div className="chips">{OFFICES.map((o) => <button key={o.key} type="button" className={`chip${f.office === o.key ? ' on' : ''}`} onClick={() => setF({ ...f, office: o.key })}>{o.name}</button>)}</div>
      </Field>
      <DetailsForm f={f} set={(patch) => setF({ ...f, ...patch })} money={money} isNew />
      {money && <Toggle checked={loan.on} onChange={(on) => setLoan({ ...loan, on })}><span>Financed</span></Toggle>}
      {money && loan.on && (
        <div className="tr-grid">
          {LOAN_FIELDS.filter(([k]) => k !== 'balance').map(([k, label, type]) => (
            <Field key={k} label={label}><input type={type === 'date' ? 'date' : 'text'} inputMode={type === 'decimal' ? 'decimal' : undefined} value={loan[k]} onChange={(e) => setLoan({ ...loan, [k]: e.target.value })} /></Field>
          ))}
        </div>
      )}
      {!money && <p className="note">The price, loan and agreements are added by C-Suite.</p>}
      {money && <div className="tr-grid">
        {[['purchase', 'Purchase agreement'], ['finance', 'Finance agreement']].map(([k, label]) => (
          <label key={k} className="tr-field"><span>{label} (photo or PDF)</span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setPapers({ ...papers, [k]: e.target.files?.[0] || null })} />
          </label>
        ))}
      </div>}
      <Toggle checked={email} onChange={setEmail}>
        <span>Email {who}</span>
        <span className="note">{email ? 'Insurance: add it to the policy. Bookkeeper: record the purchase and the loan, with the agreements attached. The agreements also go into QuickBooks.' : 'No email; you can send it later from the truck’s history.'}</span>
      </Toggle>
      <div className="panel-buttons">
        <button type="button" className="btn btn-small" disabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add truck'}</button>
        <button type="button" className="btn btn-small btn-quiet" onClick={onClose}>Cancel</button>
      </div>
      <Msg m={m} />
    </section>
  );
}

/* ---------- Who gets the emails (C-Suite) ---------- */
function EmailSettings({ settings }) {
  const router = useRouter();
  const [f, setF] = useState({ insurance_name: '', insurance_email: '', bookkeeper_name: '', bookkeeper_email: '', reply_to: '', ...Object.fromEntries(Object.entries(settings || {}).map(([k, v]) => [k, v || ''])) });
  const [m, setM] = useState(null);
  const save = async () => {
    const { error } = await rpc('set_fleet_settings', { p: f });
    setM(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved.' });
    if (!error) router.refresh();
  };
  return (
    <section className="panel tr-settings">
      <h2>Who gets the truck emails</h2>
      <p className="note">When a truck is added or comes off the sheet, the insurance agent and the bookkeeper each get an email. Replies go to the “Replies to” address, and it gets a copy.</p>
      <div className="tr-grid">
        <Field label="Insurance agent"><input value={f.insurance_name} onChange={(e) => setF({ ...f, insurance_name: e.target.value })} /></Field>
        <Field label="Their email"><input type="email" value={f.insurance_email} onChange={(e) => setF({ ...f, insurance_email: e.target.value })} /></Field>
        <Field label="Bookkeeper"><input value={f.bookkeeper_name} onChange={(e) => setF({ ...f, bookkeeper_name: e.target.value })} /></Field>
        <Field label="Their email"><input type="email" value={f.bookkeeper_email} onChange={(e) => setF({ ...f, bookkeeper_email: e.target.value })} /></Field>
        <Field label="Replies to"><input type="email" value={f.reply_to} onChange={(e) => setF({ ...f, reply_to: e.target.value })} /></Field>
      </div>
      <div className="panel-buttons"><button type="button" className="btn btn-small" onClick={save}>Save</button></div>
      <Msg m={m} />
    </section>
  );
}

/* ---------- Samsara (C-Suite, change 81) ---------- */
function SamsaraPanel({ auto }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [out, setOut] = useState(null);
  const run = async (action) => {
    if (action === 'push_all' && !window.confirm('Make these changes in Samsara now (names, plates, office tags)?')) return;
    setBusy(action === 'preview' ? 'Checking Samsara…' : 'Updating Samsara…'); setOut(null);
    const res = await fetch('/api/samsara', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const j = await res.json().catch(() => ({}));
    setBusy(''); setOut({ action, ...j });
    if (action === 'push_all') router.refresh();
  };
  const flip = async (on) => {
    const { error } = await rpc('set_samsara_auto', { p_on: on });
    if (error) setOut({ ok: false, text: error.message }); else router.refresh();
  };
  return (
    <section className="panel tr-settings">
      <h2>Samsara</h2>
      <p className="note">The sheet sets each truck’s Samsara name (“Adin Sanford -118”), plate and office tag, matched by VIN, and renames sold trucks “SOLD -123”. Procare Sync then pins the tech’s Samsara driver to their truck. New trucks show up in Samsara when the camera is installed; the next morning’s run sets them up.</p>
      <div className="panel-buttons">
        <button type="button" className="btn btn-small btn-quiet" disabled={!!busy} onClick={() => run('preview')}>Preview changes</button>
        <button type="button" className="btn btn-small" disabled={!!busy} onClick={() => run('push_all')}>Update Samsara now</button>
      </div>
      <Toggle checked={!!auto} onChange={flip}>
        <span>Keep Samsara in step automatically</span>
        <span className="note">{auto ? 'On: every change on the sheet goes to Samsara right away, and new trucks are set up each morning.' : 'Off: nothing changes in Samsara until you press Update Samsara now.'}</span>
      </Toggle>
      {busy && <p className="note">{busy}</p>}
      {out && (out.text ? <p className={out.ok ? 'ok' : 'error'}>{out.text}</p> : (
        <div className="tr-ss-out">
          <p className={out.problems?.length ? 'error' : 'ok'}>{out.action === 'preview' ? `${(out.lines || []).filter((l) => /^Truck /.test(l)).length} trucks would change.` : `Updated ${out.changed} trucks in Samsara.`}{out.problems?.length ? ` Problems: ${out.problems.join(' · ')}` : ''}</p>
          <ul className="tr-ss-lines">{(out.lines || []).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      ))}
    </section>
  );
}

/* ---------- The sheet ---------- */
const FILTERS = [
  { key: 'sheet', label: 'On the sheet', test: ON_SHEET },
  { key: 'road', label: 'On the road', test: (t) => t.status === 'active' },
  { key: 'for_sale', label: 'For sale', test: (t) => t.status === 'for_sale' },
  { key: 'nodriver', label: 'No driver', test: (t) => t.status === 'active' && !t.driver_id },
  { key: 'sold', label: 'Sold', test: (t) => t.status === 'sold' },
  { key: 'gone', label: 'Off the fleet', test: (t) => t.status === 'gone' },
  { key: 'all', label: 'Everything', test: () => true },
];
const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
/** Columns: label, sort value, money only. */
const COLS = [
  { key: 'truck', label: 'Truck', v: (t) => (/^\d+$/.test(t.truck_no || '') ? Number(t.truck_no) : t.truck_no || '') },
  { key: 'vehicle', label: 'Vehicle', v: (t) => `${t.make || ''} ${t.model || ''} ${t.year || ''}` },
  { key: 'driver', label: 'Driver', v: (t) => t.driver || t.driver_note || '' },
  { key: 'office', label: 'Office', v: (t) => OFFICE_NAME[t.office] || '' },
  { key: 'tag', label: 'Tag', v: (t) => (t.tag_month ? MONTHS.indexOf(t.tag_month) : 99) },
  { key: 'miles', label: 'Miles', v: (t) => num(t.mileage) },
  { key: 'payment', label: 'Payment', money: true, v: (t) => num(openLoan(t)?.payment) },
  { key: 'ends', label: 'Loan ends', money: true, v: (t) => openLoan(t)?.end_on || null },
  { key: 'owed', label: 'Owed', money: true, v: (t) => num(openLoan(t)?.balance) },
  { key: 'value', label: 'Value', money: true, v: (t) => num(t.value) },
  { key: 'status', label: 'Status', v: (t) => Object.keys(STATUS).indexOf(t.status) },
];

export default function TrucksView({ trucks, people, settings, money, verify, today, samsara = null, chief = false }) {
  const [office, setOffice] = useState('all');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('sheet');
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSamsara, setShowSamsara] = useState(false);
  const tot = fleetTotals(trucks);

  const test = FILTERS.find((f) => f.key === filter)?.test || ON_SHEET;
  const cols = COLS.filter((c) => money || !c.money);
  const sortBy = (key) => setSort((s) => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }) : { key, dir: 1 }));
  const list = trucks.filter((t) => {
    if (!test(t)) return false;
    if (office !== 'all' && (t.office || 'none') !== office) return false;
    if (q) {
      const s = q.toLowerCase();
      return [t.truck_no, t.vin, t.plate, t.driver, t.driver_note, t.model, t.make, t.gas_card].some((x) => String(x || '').toLowerCase().includes(s));
    }
    return true;
  });
  if (sort.key) {
    const col = COLS.find((c) => c.key === sort.key);
    list.sort((a, b) => {
      const x = col.v(a), y = col.v(b);
      if (x === null || x === '') return 1;   // blanks last either way
      if (y === null || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * sort.dir;
    });
  }
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, trucks.filter(f.test).length]));

  return (
    <>
      <div className="rc-top bug-band">
        <div>
          <p className="rc-kicker">Operations</p>
          <h1 className="rc-title">The <em>trucks</em></h1>
        </div>
        <p className="rc-updated">Drivers, offices, maintenance{money ? ', loans and value' : ''}. Sold trucks drop off the sheet.</p>
      </div>

      {verify && <p className="note tr-verify">Loans, values and selling are behind the authenticator step. <a href={verify}>Verify to see them</a>.</p>}

      <div className="fin-tiles">
        <div className="fin-tile"><span className="note">Trucks on the road</span><strong>{tot.count - tot.forSale}</strong>
          <small className="note">{OFFICES.map((o) => `${o.name.replace('Atlanta ', '')} ${tot.byOffice[o.key] || 0}`).join(' · ')}</small></div>
        <div className="fin-tile"><span className="note">For sale</span><strong>{tot.forSale}</strong><small className="note">{tot.noDriver} active with no driver</small></div>
        {money && <div className="fin-tile"><span className="note">Truck payments a month</span><strong>{dollars(tot.payments)}</strong><small className="note">{dollars(tot.payments * 12)} a year</small></div>}
        {money && <div className="fin-tile"><span className="note">Owed on trucks</span><strong>{dollars(tot.balance)}</strong><small className="note">Value {dollars(tot.value)} ({tot.valued} valued) · equity {dollars(tot.equity)}</small></div>}
      </div>

      <div className="chips tr-filters" role="group" aria-label="Show">
        {FILTERS.filter((f) => counts[f.key] > 0 || f.key === 'sheet').map((f) => (
          <button key={f.key} type="button" className={`chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>{f.label} <span className="tr-count">{counts[f.key]}</span></button>
        ))}
      </div>
      <div className="tr-controls">
        <div className="chips">
          {[['all', 'All offices'], ...OFFICES.map((o) => [o.key, o.name])].map(([k, label]) => (
            <button key={k} type="button" className={`chip${office === k ? ' on' : ''}`} onClick={() => setOffice(k)}>{label}</button>
          ))}
        </div>
        <input type="search" className="tr-search" placeholder="Truck #, driver, VIN, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn btn-small" onClick={() => setAdding(true)}>Add a truck</button>
        {money && <button type="button" className="btn btn-small btn-quiet" onClick={() => setShowSettings(!showSettings)}>Email settings</button>}
        {chief && <button type="button" className="btn btn-small btn-quiet" onClick={() => setShowSamsara(!showSamsara)}>Samsara{samsara?.auto ? ' (on)' : ''}</button>}
      </div>

      {money && showSettings && <EmailSettings settings={settings} />}
      {chief && showSamsara && <SamsaraPanel auto={samsara?.auto} />}
      {money && settings && !settings.bookkeeper_email && !showSettings && (
        <p className="error tr-verify">The bookkeeper’s email isn’t set yet, so sold / added emails only go to insurance. <button type="button" className="linklike" onClick={() => setShowSettings(true)}>Add it</button></p>
      )}
      {adding && <AddTruck today={today} settings={settings} money={money} onClose={() => setAdding(false)} />}

      <div className="tr-scroll">
        <table className="ops-table tr-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="tr-sort" onClick={() => sortBy(c.key)}>
                    {c.label}<span aria-hidden="true">{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ' ↕'}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={cols.length} className="note">{trucks.length ? 'No trucks match.' : 'No trucks yet.'}</td></tr>}
            {list.map((t) => {
              const l = money ? openLoan(t) : null;
              const isOpen = open === t.id;
              return (
                <Fragment key={t.id}>
                  <tr className={`tr-row${isOpen ? ' open' : ''}`} onClick={() => setOpen(isOpen ? null : t.id)}>
                    <th scope="row"><button type="button" className="linklike" aria-expanded={isOpen}>{t.truck_no || '—'}</button></th>
                    <td>{truckName(t)}<span className="tr-vin">…{last6(t.vin)}</span></td>
                    <td>{t.driver || <span className="note">{t.driver_note || 'No driver'}</span>}</td>
                    <td>{OFFICE_NAME[t.office]?.replace('Atlanta ', '') || '—'}</td>
                    <td>{t.plate || '—'}{t.tag_month ? <span className="tr-vin">{t.tag_month.slice(0, 3)}</span> : null}</td>
                    <td>{t.mileage ? Number(t.mileage).toLocaleString('en-US') : '—'}</td>
                    {money && <>
                      <td>{l ? dollars(l.payment, true) : '—'}</td>
                      <td>{l?.end_on ? usDate(l.end_on) : '—'}</td>
                      <td>{l ? dollars(l.balance) : '—'}</td>
                      <td>{dollars(t.value)}</td>
                    </>}
                    <td><span className={`pill tr-st-${t.status}`}>{STATUS[t.status]?.label}</span></td>
                  </tr>
                  {isOpen && (
                    <tr className="tr-open"><td colSpan={cols.length}><TruckCard key={t.id} t={t} people={people} money={money} today={today} settings={settings} samsara={samsara?.trucks?.[t.id]} /></td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
