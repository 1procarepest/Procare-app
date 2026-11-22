'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { dollars, usDate } from '@/lib/trucks';
import { KINDS, SECTIONS, SIZES, VALUED, addMonth, buildInventory, groupByCategory, monthLabel, num } from '@/lib/inventory';
import Picker from '../../Picker';
import Toggle from '../../Toggle';

const rpc = (name, args) => createClient().rpc(name, args);
const clean = (s) => String(s ?? '').replace(/[$,\s]/g, '');
const qtyText = (x) => (x === null || x === undefined || x === '' ? '' : String(Number(x)));
const price2 = (x) => (x === null || x === undefined ? '–' : Number(x) < 1 ? `$${Number(x).toFixed(3)}` : dollars(x, true));
const SOURCE = { sheet: 'from the sheet', typed: 'typed in', receipt: 'from a receipt', bwi_list: 'BWI price list', bwi_expo: 'BWI Expo' };

function Msg({ m }) {
  if (!m) return null;
  return <p className={m.ok ? 'ok' : 'error'} role="status">{m.text}</p>;
}

/* ================= Count ================= */
function emptyEntry(line) {
  return { qty: qtyText(line?.qty), repair: qtyText(line?.repair), parts: qtyText(line?.parts), sizes: { ...(line?.sizes || {}) } };
}

function CountTab({ inv, scope, loc, section }) {
  const router = useRouter();
  const items = useMemo(() => inv.items.filter((i) => i.section === section && i.active), [inv.items, section]);
  const cur = inv.current(loc, section);
  const prev = inv.previous(loc, section);
  const [vals, setVals] = useState(() => Object.fromEntries(items.map((i) => [i.id, emptyEntry(cur.lines[i.id])])));
  const [dirty, setDirty] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [stocked, setStocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);

  // A different place, section or month: start from what's saved there
  const key = `${loc}|${section}|${inv.month}|${cur.count?.updated_at || ''}`;
  useEffect(() => {
    setVals(Object.fromEntries(items.map((i) => [i.id, emptyEntry(cur.lines[i.id])])));
    setDirty(new Set()); setM(null);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id, patch) => { setVals((v) => ({ ...v, [id]: { ...v[id], ...patch } })); setDirty((d) => new Set(d).add(id)); };
  const qtyOf = (i, e) => (i.kind === 'uniform' ? Object.values(e?.sizes || {}).reduce((s, x) => s + (Number(clean(x)) || 0), 0) : Number(clean(e?.qty)) || 0);
  const value = (i) => (VALUED.has(i.kind) ? qtyOf(i, vals[i.id]) * (num(i.price) || 0) : 0);
  const total = items.reduce((s, i) => s + value(i), 0);
  const tbs = items.filter((i) => i.kind === 'tbs').reduce((s, i) => s + value(i), 0);
  const equip = items.filter((i) => i.kind === 'equipment').reduce((s, i) => s + qtyOf(i, vals[i.id]) * (num(i.price) || 0), 0);
  const prevTotal = prev.count ? num(prev.count.total) : null;
  const counted = items.filter((i) => { const e = vals[i.id]; return e && (e.qty !== '' || e.repair !== '' || Object.keys(e.sizes || {}).length); }).length;

  const shown = items.filter((i) => (!q || `${i.name} ${i.category} ${i.item_no || ''}`.toLowerCase().includes(q.toLowerCase()))
    && (!stocked || num(prev.lines[i.id]?.qty) > 0 || num(cur.lines[i.id]?.qty) > 0 || dirty.has(i.id)));

  const save = async (done) => {
    setBusy(true); setM(null);
    const lines = [...dirty].map((id) => {
      const e = vals[id]; const i = inv.itemById[id];
      if (i.kind === 'uniform') return { item: id, sizes: Object.fromEntries(Object.entries(e.sizes).filter(([, x]) => clean(x) !== '').map(([s, x]) => [s, clean(x)])) };
      return { item: id, qty: clean(e.qty), repair: clean(e.repair), parts: clean(e.parts) };
    });
    for (const l of lines) {
      for (const k of ['qty', 'repair', 'parts']) if (l[k] && !/^\d+(\.\d+)?$/.test(l[k])) { setBusy(false); setM({ ok: false, text: `“${inv.itemById[l.item].name}”: type a number.` }); return; }
    }
    const { error } = await rpc('save_inventory_count', { p_location: loc, p_month: inv.month, p_section: section, p_lines: lines, p_done: done });
    setBusy(false);
    if (error) { setM({ ok: false, text: error.message }); return; }
    setDirty(new Set());
    setM({ ok: true, text: done ? 'Count finished. Thanks!' : done === false ? 'Opened the count again.' : 'Saved.' });
    router.refresh();
  };

  const status = cur.count
    ? cur.count.status === 'done'
      ? `Finished ${cur.count.done_at ? usDate(cur.count.done_at.slice(0, 10)) : ''}${cur.count.counted_by ? ` by ${cur.count.counted_by}` : ''}${cur.count.source === 'sheet' ? ' (from the sheet)' : ''}`
      : `Started${cur.count.counted_by ? ` by ${cur.count.counted_by}` : ''}, last saved ${new Date(cur.count.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Not started yet';

  return (
    <>
      <div className="fin-tiles">
        <div className="fin-tile"><span className="note">{section === 'wildlife' ? 'Materials' : 'Inventory'} counted so far</span><strong>{dollars(total)}</strong>
          <small className="note">{counted} of {items.length} items{section === 'pest' ? ` · termite stations ${dollars(tbs)}` : ''}</small></div>
        <div className="fin-tile"><span className="note">Last count</span><strong>{prevTotal === null ? '–' : dollars(prevTotal)}</strong>
          <small className="note">{prev.count ? monthLabel(prev.count.month, true) : 'None yet'}</small></div>
        <div className="fin-tile"><span className="note">Equipment (working)</span><strong>{dollars(equip)}</strong><small className="note">Not in the inventory total</small></div>
        <div className="fin-tile"><span className="note">This month’s count</span><strong className="inv-status">{cur.count?.status === 'done' ? 'Done' : cur.count ? 'In progress' : 'Not started'}</strong><small className="note">{status}</small></div>
      </div>

      <div className="tr-controls">
        <input className="tr-search" type="search" placeholder="Find an item…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Toggle checked={stocked} onChange={setStocked} small><span>Only items we had last time</span></Toggle>
      </div>

      {groupByCategory(shown).map((g) => (
        <section key={g.category} className="inv-cat">
          <h2 className="fin-h2">{g.category}</h2>
          <div className="tr-scroll">
            <table className="ops-table inv-table">
              <thead>
                <tr><th>Item</th><th>Last</th>
                  {g.items[0].kind === 'equipment' ? <><th>Working</th><th>Needs repair</th><th>Strip for parts</th></>
                    : g.items[0].kind === 'uniform' ? <th>By size</th> : <><th>Count</th><th>Value</th></>}
                </tr>
              </thead>
              <tbody>
                {g.items.map((i) => {
                  const e = vals[i.id] || emptyEntry(null);
                  const last = prev.lines[i.id];
                  return (
                    <tr key={i.id} className={dirty.has(i.id) ? 'inv-dirty' : ''}>
                      <th scope="row">{i.name}<span className="tr-vin">{[i.unit, i.price !== null ? price2(i.price) : 'no price yet'].filter(Boolean).join(' · ')}</span></th>
                      <td className="inv-last">{last ? (i.kind === 'equipment' ? `${qtyText(last.qty) || 0} / ${qtyText(last.repair) || 0}` : qtyText(last.qty)) : '–'}</td>
                      {i.kind === 'equipment' ? (
                        <>
                          <td><input className="inv-in" inputMode="decimal" aria-label={`${i.name} working`} value={e.qty} onChange={(ev) => set(i.id, { qty: ev.target.value })} /></td>
                          <td><input className="inv-in" inputMode="decimal" aria-label={`${i.name} needs repair`} value={e.repair} onChange={(ev) => set(i.id, { repair: ev.target.value })} /></td>
                          <td><input className="inv-in" inputMode="decimal" aria-label={`${i.name} strip for parts`} value={e.parts} onChange={(ev) => set(i.id, { parts: ev.target.value })} /></td>
                        </>
                      ) : i.kind === 'uniform' ? (
                        <td className="inv-sizes">
                          {SIZES.map((s) => (
                            <label key={s}><span>{s}</span><input className="inv-in" inputMode="numeric" value={e.sizes?.[s] ?? ''} onChange={(ev) => set(i.id, { sizes: { ...e.sizes, [s]: ev.target.value } })} /></label>
                          ))}
                        </td>
                      ) : (
                        <>
                          <td><input className="inv-in" inputMode="decimal" aria-label={`${i.name} count`} value={e.qty} onChange={(ev) => set(i.id, { qty: ev.target.value })} /></td>
                          <td>{e.qty !== '' && i.price !== null ? dollars(value(i)) : ''}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!shown.length && <p className="note">No items match.</p>}

      <div className="inv-bar">
        <span><strong>{dollars(total)}</strong> {dirty.size ? <span className="note">· {dirty.size} not saved</span> : null}</span>
        <div className="panel-buttons">
          {cur.count?.status === 'done'
            ? <><button type="button" className="btn btn-small" disabled={busy || !dirty.size} onClick={() => save(null)}>Save changes</button>
                <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => save(false)}>Open again</button></>
            : <><button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => save(null)}>Save</button>
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => save(true)}>Finish the count</button></>}
        </div>
      </div>
      <Msg m={m} />
      {scope === 'all' && <p className="note">Blank means not counted. Equipment and uniforms aren’t in the inventory total. Prices come from the item list (Items &amp; prices).</p>}
    </>
  );
}

/* ================= Dashboard ================= */
function DashboardTab({ inv, canAdmin, people }) {
  const [view, setView] = useState('total');
  const d = inv.dashboard;
  const pick = (c) => (!c ? null : view === 'tbs' ? c.tbs : view === 'other' ? c.total - c.tbs : c.total);
  const last = d.lastIdx >= 0 ? d.totals[d.lastIdx] : null;
  const before = d.lastIdx > 0 ? d.totals[d.lastIdx - 1] : null;
  const counted = inv.locations.filter((l) => inv.counts.some((c) => c.location === l.key && c.section === 'pest' && c.month === inv.month && c.status === 'done')).length;
  return (
    <>
      <div className="fin-tiles">
        <div className="fin-tile"><span className="note">Inventory, {d.lastIdx >= 0 ? monthLabel(d.months[d.lastIdx], true) : '–'}</span><strong>{last ? dollars(last.total) : '–'}</strong>
          <small className="note">{last && before ? `${last.total >= before.total ? 'Up' : 'Down'} ${dollars(Math.abs(last.total - before.total))} from the month before` : 'All places'}</small></div>
        <div className="fin-tile"><span className="note">Termite stations</span><strong>{last ? dollars(last.tbs) : '–'}</strong><small className="note">{last && last.total ? `${Math.round((last.tbs / last.total) * 100)}% of it` : ''}</small></div>
        <div className="fin-tile"><span className="note">Everything else</span><strong>{last ? dollars(last.total - last.tbs) : '–'}</strong><small className="note">Product, tools and promo</small></div>
        <div className="fin-tile"><span className="note">Counted for {monthLabel(inv.month, true)}</span><strong>{counted} of {inv.locations.length}</strong><small className="note">Places with the count finished</small></div>
      </div>
      <div className="chips">
        {[['total', 'All inventory'], ['tbs', 'Termite stations'], ['other', 'Everything but termite stations']].map(([k, label]) => (
          <button key={k} type="button" className={`chip${view === k ? ' on' : ''}`} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>
      <div className="tr-scroll">
        <table className="ops-table inv-dash">
          <thead><tr><th>{d.months[0].slice(0, 4)}</th>{d.months.map((m) => <th key={m}>{monthLabel(m).slice(0, 3)}</th>)}</tr></thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                {r.cells.map((c, i) => <td key={i} className={c?.status === 'draft' ? 'inv-draft' : ''} title={c?.from === 'sheet' ? 'From the sheet' : c?.status === 'draft' ? 'Count not finished' : ''}>{c ? dollars(pick(c)) : ''}</td>)}
              </tr>
            ))}
            <tr className="fin-sum fin-net"><th>Total</th>{d.totals.map((t, i) => <td key={i}>{t ? dollars(pick(t)) : ''}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="note">Months before the app come from the sheet’s 2026 Dashboard. A grey number is a count that isn’t finished yet.</p>
      {canAdmin && <Places locations={inv.locations} people={people} />}
    </>
  );
}

function Places({ locations, people }) {
  const router = useRouter();
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState({});
  const [m, setM] = useState(null);
  const open = (l) => { setEdit(l?.key || 'new'); setF(l ? { ...l } : { name: '', office: '', bwi_account: '', manager_id: '', wildlife_manager_id: '', has_wildlife: false, active: true }); setM(null); };
  const save = async () => {
    const { error } = await rpc('save_inventory_location', { p_key: edit === 'new' ? null : edit, p: f });
    if (error) { setM({ ok: false, text: error.message }); return; }
    setEdit(null); router.refresh();
  };
  const regions = [{ value: '', label: 'No region' }, ...OFFICES.map((o) => ({ value: o.key, label: o.name }))];
  return (
    <section className="panel inv-places">
      <h2 className="fin-h2">Places that keep inventory</h2>
      <p className="note">Each place that gets deliveries. The inventory manager counts it every month, places its BWI orders on its BWI account, and gets the reminder if the count isn’t finished. Satellites belong to a region.</p>
      <table className="ops-table">
        <thead><tr><th>Place</th><th>Inventory manager</th><th>Region</th><th>BWI account</th><th>Wildlife</th></tr></thead>
        <tbody>
          {locations.map((l) => (
            <tr key={l.key}><th><button type="button" className="linklike" onClick={() => open(l)}>{l.name}</button></th><td>{l.manager || '—'}</td><td>{OFFICE_NAME[l.office] || '—'}</td><td>{l.bwi_account || '—'}</td><td>{l.has_wildlife ? (l.wildlife_manager ? `Yes · ${l.wildlife_manager}` : 'Yes') : ''}</td></tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <div className="tr-sec">
          <div className="tr-grid">
            <label className="tr-field"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="tr-field"><span>Region</span><Picker label="Region" value={f.office || ''} options={regions} onChange={(v) => setF({ ...f, office: v })} /></label>
            <label className="tr-field"><span>Inventory manager</span><Picker label="Inventory manager" value={f.manager_id || ''} options={[{ value: '', label: 'Nobody (the region’s managers)' }, ...people.map((p) => ({ value: p.id, label: p.name, group: OFFICE_NAME[p.office] || 'No office' }))]} onChange={(v) => setF({ ...f, manager_id: v })} /></label>
            <label className="tr-field"><span>BWI account</span><input value={f.bwi_account || ''} onChange={(e) => setF({ ...f, bwi_account: e.target.value })} placeholder="EPRO725" /></label>
          </div>
          <Toggle checked={!!f.has_wildlife} onChange={(v) => setF({ ...f, has_wildlife: v })} small><span>Wildlife materials are kept here</span></Toggle>
          {f.has_wildlife && <label className="tr-field"><span>Wildlife inventory manager</span><Picker label="Wildlife inventory manager" value={f.wildlife_manager_id || ''} options={[{ value: '', label: 'Nobody (the wildlife manager)' }, ...people.map((p) => ({ value: p.id, label: p.name, group: OFFICE_NAME[p.office] || 'No office' }))]} onChange={(v) => setF({ ...f, wildlife_manager_id: v })} /></label>}
          {edit !== 'new' && <Toggle checked={f.active !== false} onChange={(v) => setF({ ...f, active: v })} small><span>Still keeps inventory</span></Toggle>}
          <div className="panel-buttons">
            <button type="button" className="btn btn-small" onClick={save}>Save</button>
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setEdit(null)}>Cancel</button>
          </div>
          <Msg m={m} />
        </div>
      )}
      {!edit && <button type="button" className="btn btn-small btn-quiet" onClick={() => open(null)}>Add a place</button>}
    </section>
  );
}

/* ================= Items & prices ================= */
const FIELDS = [['name', 'Name'], ['unit', 'Unit (how it’s counted)'], ['price', 'Price of one ($)'], ['vendor', 'Bought from'], ['item_no', 'BWI item #']];

function ItemForm({ item, section, categories, bwiPrices, onDone }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({
    section: item?.section || section, category: item?.category || '', kind: item?.kind || 'product',
    name: item?.name || '', unit: item?.unit || '', price: item?.price !== null && item?.price !== undefined ? String(Number(item.price)) : '',
    pack_qty: item?.pack_qty ? String(Number(item.pack_qty)) : '', pack_price: item?.pack_price ? String(Number(item.pack_price)) : '',
    vendor: item?.vendor || '', item_no: item?.item_no || '', active: item ? item.active : true, price_source: '', order_url: item?.order_url || '',
  }));
  const [hist, setHist] = useState(null);
  const [m, setM] = useState(null);
  useEffect(() => {
    if (!item) return;
    rpc('inventory_price_history', { p_item: item.id }).then(({ data }) => setHist(data || []));
  }, [item]);
  const each = Number(clean(f.pack_qty)) > 0 && clean(f.pack_price) !== '' ? Number(clean(f.pack_price)) / Number(clean(f.pack_qty)) : null;
  const bwi = f.item_no ? bwiPrices.find((p) => p.item_no === f.item_no.trim().toUpperCase()) : null;
  const save = async (del = false) => {
    if (del && !window.confirm(`Remove ${item.name} from the list? (If it was counted before, it’s hidden instead, so old months keep it.)`)) return;
    const { data: id, error } = await rpc('save_inventory_item', { p_id: item?.id || null, p: { ...f, item_no: f.item_no.trim().toUpperCase() }, p_delete: del });
    if (error) { setM({ ok: false, text: error.message }); return; }
    if (!del && id && f.order_url.trim() !== (item?.order_url || '')) {
      const r = await rpc('set_inventory_order_url', { p_item: id, p_url: f.order_url.trim() });
      if (r.error) { setM({ ok: false, text: r.error.message }); router.refresh(); return; }
    }
    onDone(); router.refresh();
  };
  return (
    <div className="tr-sec">
      <div className="tr-grid">
        {FIELDS.map(([k, label]) => (
          <label key={k} className="tr-field"><span>{label}</span>
            <input inputMode={k === 'price' ? 'decimal' : undefined} value={f[k]} disabled={k === 'price' && each !== null} onChange={(e) => setF({ ...f, [k]: e.target.value, ...(k === 'price' ? { price_source: 'typed' } : {}) })} />
          </label>
        ))}
        <label className="tr-field"><span>Category</span><input list="inv-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></label>
        <label className="tr-field tr-wide"><span>Where to reorder (link, optional)</span><input type="url" value={f.order_url} placeholder="https://www.amazon.com/…" onChange={(e) => setF({ ...f, order_url: e.target.value })} /></label>
      </div>
      <datalist id="inv-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="inv-pack">
        <p className="note">Small parts (screws, anchors, nozzles…): type the box price and how many come in it, and the app works out one.</p>
        <div className="tr-grid">
          <label className="tr-field"><span>Box price ($)</span><input inputMode="decimal" value={f.pack_price} onChange={(e) => setF({ ...f, pack_price: e.target.value })} /></label>
          <label className="tr-field"><span>How many in the box</span><input inputMode="decimal" value={f.pack_qty} onChange={(e) => setF({ ...f, pack_qty: e.target.value })} /></label>
          <div className="tr-field"><span>One costs</span><strong>{each !== null ? price2(each) : '–'}</strong></div>
        </div>
      </div>
      <div className="chips">{Object.entries(KINDS).map(([k, label]) => <button key={k} type="button" className={`chip${f.kind === k ? ' on' : ''}`} onClick={() => setF({ ...f, kind: k })}>{label}</button>)}</div>
      {bwi && <p className="note">BWI: {bwi.description}{bwi.pack_size ? ` (${bwi.pack_size} ${bwi.uom || ''})` : ''}, {price2(bwi.price)} on {usDate(bwi.price_on)} ({bwi.source}).</p>}
      {item && <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} small><span>On the count sheet</span></Toggle>}
      <div className="panel-buttons">
        <button type="button" className="btn btn-small" onClick={() => save(false)}>Save</button>
        {item && <button type="button" className="btn btn-small btn-quiet" onClick={() => save(true)}>Remove</button>}
        <button type="button" className="btn btn-small btn-quiet" onClick={onDone}>Cancel</button>
      </div>
      <Msg m={m} />
      {hist && hist.length > 0 && (
        <div className="note">
          {hist.length > 1 && <strong>Average of {hist.length}: {price2(hist.reduce((t, h) => t + Number(h.price || 0), 0) / hist.length)}. </strong>}
          Price history: {hist.map((h, k) => <span key={k}>{k ? ' · ' : ''}{price2(h.price)} on {usDate(h.day)} ({SOURCE[h.source] || h.source}{h.by ? `, ${h.by}` : ''})</span>)}
        </div>
      )}
    </div>
  );
}

function ItemsTab({ inv, scope, canPrice, bwiPrices }) {
  const router = useRouter();
  const [section, setSection] = useState(scope === 'wildlife' ? 'wildlife' : 'pest');
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const [hidden, setHidden] = useState(false);
  const [m, setM] = useState(null);
  const items = inv.items.filter((i) => i.section === section && (hidden || i.active)
    && (!q || `${i.name} ${i.category} ${i.item_no || ''} ${i.vendor || ''}`.toLowerCase().includes(q.toLowerCase())));
  const categories = [...new Set(inv.items.filter((i) => i.section === section).map((i) => i.category))];
  const may = canPrice[section];
  const useList = async (i) => {
    const { error } = await rpc('save_inventory_item', { p_id: i.id, p: { ...i, price: String(Number(i.list_price).toFixed(4)), price_source: 'bwi_list' } });
    if (error) setM({ ok: false, text: error.message }); else router.refresh();
  };
  const cols = section === 'pest' ? 5 : 3;
  return (
    <>
      <div className="tr-controls">
        {scope === 'all' && <div className="chips">{Object.entries(SECTIONS).map(([k, label]) => <button key={k} type="button" className={`chip${section === k ? ' on' : ''}`} onClick={() => { setSection(k); setEdit(null); }}>{label}</button>)}</div>}
        <input className="tr-search" type="search" placeholder="Find an item…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Toggle checked={hidden} onChange={setHidden} small><span>Show removed items</span></Toggle>
        {may && <button type="button" className="btn btn-small btn-quiet" onClick={() => setEdit('new')}>Add an item</button>}
      </div>
      <Msg m={m} />
      {!may && <p className="note">{section === 'pest' ? 'Each office’s inventory manager and C-Suite keep the pest items and prices.' : 'The wildlife inventory manager keeps the wildlife items and prices.'} Ask them if a price looks wrong.</p>}
      {edit === 'new' && <ItemForm section={section} categories={categories} bwiPrices={bwiPrices} onDone={() => setEdit(null)} />}
      <div className="tr-scroll">
        <table className="ops-table tr-table inv-items">
          <thead><tr><th>Item</th><th>Our price</th>{section === 'pest' ? <><th>BWI list now</th><th>Locked at the Expo</th></> : <th>Box</th>}<th>Price date</th></tr></thead>
          <tbody>
            {groupByCategory(items).map((g) => (
              <Fragment key={g.category}>
                <tr className="fin-sum"><th colSpan={cols}>{g.category} <span className="note">({g.items.length})</span></th></tr>
                {g.items.map((i) => {
                  const diff = i.list_price !== null && i.price !== null ? Number(i.list_price) - Number(i.price) : null;
                  return (
                    <Fragment key={i.id}>
                      <tr className={i.active ? '' : 'inv-off'}>
                        <th scope="row">{may ? <button type="button" className="linklike" onClick={() => setEdit(edit === i.id ? null : i.id)}>{i.name}</button> : i.name}
                          <span className="tr-vin">{[i.unit, KINDS[i.kind] !== 'Product' ? KINDS[i.kind] : null, i.item_no, i.vendor].filter(Boolean).join(' · ')}</span>
                          {i.order_url && <a className="inv-order" href={i.order_url} target="_blank" rel="noreferrer">Reorder ›</a>}</th>
                        <td>{price2(i.price)}</td>
                        {section === 'pest' ? (
                          <>
                            <td>{i.list_price !== null ? price2(i.list_price) : '—'}
                              {diff !== null && Math.abs(diff) >= 0.01 && <span className={`tr-vin ${diff > 0 ? 'inv-up' : 'inv-down'}`}>{diff > 0 ? '+' : '−'}{price2(Math.abs(diff))}</span>}
                              {may && diff !== null && Math.abs(diff) >= 0.01 && <button type="button" className="linklike inv-use" onClick={() => useList(i)}>Use it</button>}</td>
                            <td>{i.expo_price !== null ? <>{price2(i.expo_price)}<span className="tr-vin">for {i.expo_year}</span></> : '—'}</td>
                          </>
                        ) : <td>{i.pack_price && Number(i.pack_qty) > 0 ? `${price2(i.pack_price)} / ${Number(i.pack_qty)}` : '—'}</td>}
                        <td>{i.price_on ? usDate(i.price_on) : '—'}<span className="tr-vin">{SOURCE[i.price_source] || ''}</span></td>
                      </tr>
                      {edit === i.id && <tr className="tr-open"><td colSpan={cols}><ItemForm item={i} section={section} categories={categories} bwiPrices={bwiPrices} onDone={() => setEdit(null)} /></td></tr>}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {section === 'pest' && <p className="note">“BWI list now” is BWI’s latest price list worked out for one counted unit. “Locked at the Expo” is the price committed at the BWI Expo. Our price is what the count values each one at.</p>}
    </>
  );
}

/* ================= BWI Expo ================= */
function BwiTab({ inv, canAdmin }) {
  const router = useRouter();
  const b = inv.bwi;
  const [paid, setPaid] = useState(b.show ? String(Number(b.show.paid || 0)) : '0');
  const [recv, setRecv] = useState({});
  const [q, setQ] = useState('');
  const [showList, setShowList] = useState(false);
  const [m, setM] = useState(null);
  if (!b.show) return <p className="note">No BWI Expo on file yet.</p>;
  const savePaid = async () => {
    const { error } = await rpc('save_bwi_show', { p_year: b.show.year, p: { paid } });
    if (error) setM({ ok: false, text: error.message }); else { setM({ ok: true, text: 'Saved.' }); router.refresh(); }
  };
  const saveRecv = async (c) => {
    const v = clean(recv[c.id]);
    if (!/^\d+(\.\d+)?$/.test(v)) { setM({ ok: false, text: 'Type how many came in.' }); return; }
    const { error } = await rpc('set_bwi_received', { p_id: c.id, p_received: Number(v) });
    if (error) setM({ ok: false, text: error.message }); else { setRecv({ ...recv, [c.id]: undefined }); router.refresh(); }
  };
  const today = inv.month;
  const prices = b.prices.filter((p) => !q || `${p.item_no} ${p.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <p className="note">{b.show.name}, {usDate(b.show.start_on)}–{usDate(b.show.end_on)}. Prices are locked until delivered; everything is paid for by {usDate(b.show.pay_by)}.</p>
      <div className="fin-tiles">
        <div className="fin-tile"><span className="note">Committed</span><strong>{dollars(b.total)}</strong><small className="note">{dollars(b.bonus)} in bonus bucks</small></div>
        <div className="fin-tile"><span className="note">Delivered so far</span><strong>{dollars(b.inValue)}</strong><small className="note">{b.total ? `${Math.round((b.inValue / b.total) * 100)}% of it` : ''}</small></div>
        <div className="fin-tile"><span className="note">Left to pay</span><strong>{dollars(b.left)}</strong><small className="note">{dollars(b.paid)} paid{b.show.paid_on ? ` (as of ${usDate(b.show.paid_on)})` : ''}</small></div>
        <div className="fin-tile"><span className="note">To finish by {usDate(b.show.pay_by)}</span><strong>{b.perMonth !== null ? dollars(b.perMonth) : '–'}</strong><small className="note">{b.monthsLeft ? `a month for ${b.monthsLeft} months` : ''}</small></div>
      </div>
      {canAdmin && (
        <div className="tr-controls">
          <label className="tr-field"><span>Paid to BWI so far ($)</span><input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
          <button type="button" className="btn btn-small" onClick={savePaid}>Save</button>
        </div>
      )}
      <Msg m={m} />
      {b.accounts.map((a) => (
        <section key={a.account} className="inv-cat">
          <h2 className="fin-h2">{a.place ? a.place.name : 'Place not set'} <span className="note">BWI account {a.account} · {dollars(a.total)}</span></h2>
          {!a.place && <p className="note">{canAdmin ? 'Set which place this account ships to on the Dashboard tab (Places that keep inventory).' : 'C-Suite sets which place this account ships to.'}</p>}
          <div className="tr-scroll">
            <table className="ops-table tr-table">
              <thead><tr><th>Item</th><th>Delivery</th><th>Committed</th><th>Price</th><th>Total</th><th>Came in</th></tr></thead>
              <tbody>
                {a.rows.map((c) => {
                  const done = Number(c.received) >= Number(c.qty);
                  const due = c.deliver_by && c.deliver_by <= today && !done;
                  return (
                    <tr key={c.id}>
                      <th scope="row">{c.description}<span className="tr-vin">{c.item_no} · {c.vendor}</span></th>
                      <td>{c.deliver_on ? (c.deliver_on === c.deliver_by ? usDate(c.deliver_on) : `${usDate(c.deliver_on)}–${usDate(c.deliver_by)}`) : '—'}{due && <span className="pill tr-st-for_sale">Due</span>}</td>
                      <td>{Number(c.qty)}</td>
                      <td>{dollars(c.price, true)}</td>
                      <td>{dollars(c.total)}</td>
                      <td className="inv-recv">
                        <input className="inv-in" inputMode="decimal" aria-label={`${c.description} came in`} value={recv[c.id] ?? qtyText(c.received)} onChange={(e) => setRecv({ ...recv, [c.id]: e.target.value })} />
                        {recv[c.id] !== undefined && <button type="button" className="linklike" onClick={() => saveRecv(c)}>Save</button>}
                        {done && <span className="pill pill-good">All in</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <Toggle checked={showList} onChange={setShowList} small><span>BWI prices ({b.prices.length})</span></Toggle>
      {showList && (
        <>
          <input className="tr-search" type="search" placeholder="Find a BWI item…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tr-scroll">
            <table className="ops-table tr-table">
              <thead><tr><th>Item</th><th>Pack</th><th>Price</th><th>As of</th></tr></thead>
              <tbody>{prices.map((p) => <tr key={p.item_no}><th>{p.description}<span className="tr-vin">{p.item_no}</span></th><td>{[p.pack_size, p.uom].filter(Boolean).join(' ') || '—'}</td><td>{price2(p.price)}</td><td>{usDate(p.price_on)}<span className="tr-vin">{p.source}</span></td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/* ================= Page ================= */
export default function InventoryView({ data, scope, canPrice, canAdmin, people = [], startTab = 'count', today }) {
  const inv = useMemo(() => buildInventory(data), [data]);
  const router = useRouter();
  const path = usePathname();
  const tabs = [['count', 'Count'], ...(scope === 'all' ? [['dashboard', 'Dashboard']] : []), ['items', 'Items & prices'], ...(scope === 'all' && inv.bwi ? [['bwi', 'BWI Expo']] : [])];
  const [tab, setTab] = useState(tabs.some(([k]) => k === startTab) ? startTab : 'count');
  const places = inv.locations.filter((l) => scope === 'all' || l.has_wildlife);
  const [loc, setLoc] = useState(places[0]?.key || '');
  const place = places.find((l) => l.key === loc);
  const [section, setSection] = useState(scope === 'wildlife' ? 'wildlife' : 'pest');
  const sec = place?.has_wildlife ? section : 'pest';
  const thisMonth = `${today.slice(0, 7)}-01`;
  const goMonth = (k) => router.push(`${path}?month=${addMonth(inv.month, k)}&tab=${tab}`);

  return (
    <>
      <div className="rc-top brand-head bug-band">
        <div>
          <p className="rc-kicker">{scope === 'wildlife' ? 'Wildlife' : 'Operations'}</p>
          <h1 className="rc-title">Inventory <em>{monthLabel(inv.month, true)}</em></h1>
        </div>
        <p className="rc-updated">
          <button type="button" className="linklike" onClick={() => goMonth(-1)}>← {monthLabel(addMonth(inv.month, -1))}</button>
          {inv.month < thisMonth && <>{' · '}<button type="button" className="linklike" onClick={() => goMonth(1)}>{monthLabel(addMonth(inv.month, 1))} →</button></>}
        </p>
      </div>
      <div className="chips inv-tabs">
        {tabs.map(([k, label]) => <button key={k} type="button" className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === 'count' && (
        <>
          {places.length > 1 && <div className="chips">{places.map((l) => <button key={l.key} type="button" className={`chip${loc === l.key ? ' on' : ''}`} onClick={() => setLoc(l.key)}>{l.name}</button>)}</div>}
          {scope === 'all' && place?.has_wildlife && (
            <div className="chips">{Object.entries(SECTIONS).map(([k, label]) => <button key={k} type="button" className={`chip${sec === k ? ' on' : ''}`} onClick={() => setSection(k)}>{label}</button>)}</div>
          )}
          {place && sec === 'wildlife' && place.wildlife_manager && <p className="note inv-who">Wildlife inventory manager: {place.wildlife_manager}</p>}
          {place && sec === 'pest' && (place.manager || place.bwi_account) && (
            <p className="note inv-who">{place.manager ? `Inventory manager: ${place.manager}` : ''}{place.manager && place.bwi_account ? ' · ' : ''}{place.bwi_account ? `BWI orders on account ${place.bwi_account}` : ''}</p>
          )}
          {place ? <CountTab key={`${loc}-${sec}`} inv={inv} scope={scope} loc={loc} section={sec} /> : <p className="note">No places set up yet.</p>}
        </>
      )}
      {tab === 'dashboard' && <DashboardTab inv={inv} canAdmin={canAdmin} people={people} />}
      {tab === 'items' && <ItemsTab inv={inv} scope={scope} canPrice={canPrice} bwiPrices={inv.bwi?.prices || []} />}
      {tab === 'bwi' && <BwiTab inv={inv} canAdmin={canAdmin} />}
    </>
  );
}
