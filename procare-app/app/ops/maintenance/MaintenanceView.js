'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { SERVICE } from '@/lib/maintenance';
import { dollars, usDate } from '@/lib/trucks';
import Picker from '../../Picker';
import OpsHero from '../OpsHero';

const rpc = (name, args) => createClient().rpc(name, args);
const mi = (x) => (x === null || x === undefined ? '—' : `${Number(x).toLocaleString('en-US')}`);
const STATUS = { overdue: { label: 'Overdue', cls: 'pill-bad' }, soon: { label: 'Due soon', cls: 'tr-st-for_sale' }, none: { label: 'No oil change on file', cls: '' }, ok: { label: 'OK', cls: 'pill-good' } };

function Msg({ m }) {
  if (!m) return null;
  return <p className={m.ok ? 'ok' : 'error'} role="status">{m.text}</p>;
}

/** Log a service on a truck (oil change by default). */
function LogForm({ trucks, start, today, onDone }) {
  const router = useRouter();
  const pick = trucks.find((t) => t.id === start);
  const [f, setF] = useState({ truck: start || '', service: 'oil', day: today, miles: pick?.oil?.now ?? '', cost: '', text: '' });
  const [m, setM] = useState(null);
  const options = useMemo(() => trucks.map((t) => ({ value: t.id, label: `${t.truck_no || '?'} · ${t.driver || t.driver_note || 'no driver'}`, group: OFFICE_NAME[t.office] || 'No office' })), [trucks]);
  const save = async () => {
    if (!f.truck) { setM({ ok: false, text: 'Pick the truck.' }); return; }
    const { error } = await rpc('add_truck_log', {
      p_truck: f.truck, p_kind: 'maintenance', p_day: f.day, p_text: f.text,
      p_cost: f.cost ? Number(String(f.cost).replace(/[$,\s]/g, '')) : null,
      p_miles: f.miles !== '' && f.miles !== null ? Number(String(f.miles).replace(/[,\s]/g, '')) : null, p_service: f.service,
    });
    if (error) { setM({ ok: false, text: error.message }); return; }
    onDone?.(); router.refresh();
  };
  return (
    <div className="tr-sec mt-log">
      <div className="tr-grid">
        <label className="tr-field"><span>Truck</span><Picker label="Truck" value={f.truck} options={options} placeholder="Pick a truck…"
          onChange={(v) => setF({ ...f, truck: v, miles: trucks.find((t) => t.id === v)?.oil?.now ?? f.miles })} /></label>
        <label className="tr-field"><span>Date</span><input type="date" value={f.day} max={today} onChange={(e) => setF({ ...f, day: e.target.value })} /></label>
        <label className="tr-field"><span>Miles</span><input inputMode="numeric" value={f.miles ?? ''} onChange={(e) => setF({ ...f, miles: e.target.value })} /></label>
        <label className="tr-field"><span>Cost ($)</span><input inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></label>
        <label className="tr-field tr-wide"><span>Notes (optional)</span><input value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Shop, parts, anything to remember" /></label>
      </div>
      <div className="chips">
        {Object.entries(SERVICE).map(([k, label]) => <button key={k} type="button" className={`chip${f.service === k ? ' on' : ''}`} onClick={() => setF({ ...f, service: k })}>{label}</button>)}
      </div>
      <div className="panel-buttons">
        <button type="button" className="btn btn-small" onClick={save}>Save</button>
        <button type="button" className="btn btn-small btn-quiet" onClick={onDone}>Cancel</button>
      </div>
      <Msg m={m} />
    </div>
  );
}

function Rules({ rules }) {
  const router = useRouter();
  const [f, setF] = useState({ miles: rules.miles, months: rules.months });
  const [m, setM] = useState(null);
  const save = async () => {
    const { error } = await rpc('set_oil_rules', { p_miles: Number(String(f.miles).replace(/[,\s]/g, '')), p_months: Number(f.months) });
    setM(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved.' });
    if (!error) router.refresh();
  };
  return (
    <div className="mt-rules">
      <label className="tr-field"><span>Oil change every (miles)</span><input inputMode="numeric" value={f.miles} onChange={(e) => setF({ ...f, miles: e.target.value })} /></label>
      <label className="tr-field"><span>or every (months)</span><input inputMode="numeric" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} /></label>
      <button type="button" className="btn btn-small btn-quiet" onClick={save}>Save rule</button>
      <Msg m={m} />
    </div>
  );
}

export default function MaintenanceView({ m, canSetRules, today }) {
  const router = useRouter();
  const [office, setOffice] = useState('all');
  const [show, setShow] = useState('due');
  const [logFor, setLogFor] = useState(null);   // truck id, 'new' or null
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const inOffice = (t) => (office === 'wildlife' ? !!t.wildlife : office === 'all' || (t.office || 'none') === office);
  const FILTERS = [
    { key: 'due', label: 'Due or overdue', test: (t) => ['overdue', 'soon'].includes(t.oil.status) },
    { key: 'none', label: 'No oil change on file', test: (t) => t.oil.status === 'none' },
    { key: 'all', label: 'Every truck', test: () => true },
  ];
  const test = FILTERS.find((x) => x.key === show).test;
  const list = m.trucks.filter((t) => inOffice(t) && test(t));
  const entries = m.entries.filter(inOffice);

  const refresh = async () => {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/samsara', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'odometers' }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false); setMsg({ ok: !!j.ok, text: j.text || `Error ${res.status}` });
    router.refresh();
  };

  return (
    <div className="ops-fun">
      <OpsHero title="Truck" em="maintenance" bug="termite">
        <span>
          Oil change every {m.rules.miles.toLocaleString('en-US')} miles or {m.rules.months} months.
          {' '}Miles from Samsara{m.odometerAt ? ` as of ${usDate(m.odometerAt.slice(0, 10))}` : ' (not read yet)'} · <button type="button" className="linklike" disabled={busy} onClick={refresh}>{busy ? 'Reading…' : 'Refresh miles'}</button>
        </span>
      </OpsHero>
      <Msg m={msg} />

      <div className="fin-tiles">
        <div className={`fin-tile${m.counts.overdue ? ' drv-warn' : ''}`}><span className="note">Oil changes overdue</span><strong>{m.counts.overdue}</strong><small className="note">{m.counts.soon} due soon</small></div>
        <div className="fin-tile"><span className="note">No oil change on file</span><strong>{m.counts.none}</strong><small className="note">Log the last one so reminders start</small></div>
        <div className="fin-tile"><span className="note">Maintenance this month</span><strong>{dollars(m.spend.thisMonth)}</strong><small className="note">{dollars(m.spend.total)} in the last 12 months</small></div>
        <div className="fin-tile"><span className="note">By office (12 months)</span><strong>{dollars(Math.max(0, ...Object.values(m.byOffice), 0))}</strong>
          <small className="note">{OFFICES.map((o) => `${o.name.replace('Atlanta ', '')} ${dollars(m.byOffice[o.key] || 0)}`).join(' · ')} · Wildlife {dollars(m.wildlifeSpend)}</small></div>
      </div>

      <div className="chips tr-filters">
        {FILTERS.map((x) => <button key={x.key} type="button" className={`chip${show === x.key ? ' on' : ''}`} onClick={() => setShow(x.key)}>{x.label} <span className="tr-count">{m.trucks.filter((t) => inOffice(t) && x.test(t)).length}</span></button>)}
      </div>
      <div className="tr-controls">
        <div className="chips">
          {[['all', 'All offices'], ...OFFICES.map((o) => [o.key, o.name]), ['wildlife', 'Wildlife']].map(([k, label]) => (
            <button key={k} type="button" className={`chip${office === k ? ' on' : ''}`} onClick={() => setOffice(k)}>{label}</button>
          ))}
        </div>
        <button type="button" className="btn btn-small" onClick={() => setLogFor('new')}>Log maintenance</button>
      </div>
      {logFor === 'new' && <LogForm trucks={m.trucks} today={today} onDone={() => setLogFor(null)} />}

      <div className="tr-scroll">
        <table className="ops-table tr-table">
          <thead><tr><th>Truck</th><th>Driver</th><th>Office</th><th>Miles now</th><th>Last oil change</th><th>Next due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={8} className="note">{show === 'due' ? 'Nothing due. 👍' : 'Nobody here.'}</td></tr>}
            {list.map((t) => {
              const o = t.oil;
              return [
                <tr key={t.id}>
                  <th scope="row">{t.truck_no || '—'}<span className="tr-vin">{[t.year, t.model].filter(Boolean).join(' ')}</span></th>
                  <td>{t.driver || <span className="note">{t.driver_note || 'No driver'}</span>}</td>
                  <td>{OFFICE_NAME[t.office]?.replace('Atlanta ', '') || '—'}{t.wildlife ? <span className="tr-vin">Wildlife</span> : null}</td>
                  <td>{mi(o.now)}</td>
                  <td>{t.last_oil ? <>{usDate(t.last_oil.day)}<span className="tr-vin">{t.last_oil.miles ? `at ${mi(t.last_oil.miles)} mi` : 'miles not logged'}</span></> : '—'}</td>
                  <td>{o.status === 'none' ? '—' : <>{o.left !== null ? (o.left <= 0 ? `${mi(-o.left)} mi over` : `in ${mi(o.left)} mi`) : 'miles unknown'}<span className="tr-vin">or by {usDate(o.dueOn)}</span></>}</td>
                  <td><span className={`pill ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span></td>
                  <td><button type="button" className="btn btn-small btn-quiet" onClick={() => setLogFor(logFor === t.id ? null : t.id)}>Log oil change</button></td>
                </tr>,
                logFor === t.id && <tr key={`${t.id}-log`} className="tr-open"><td colSpan={8}><LogForm trucks={m.trucks} start={t.id} today={today} onDone={() => setLogFor(null)} /></td></tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-grid">
        <section className="panel">
          <h2 className="fin-h2">Cost by truck (12 months)</h2>
          {m.byTruck.length === 0 ? <p className="note">No maintenance logged yet.</p> : (
            <table className="ops-table">
              <tbody>{m.byTruck.filter((x) => (office === 'wildlife' ? x.wildlife : office === 'all' || x.office === office)).slice(0, 15).map((x) => (
                <tr key={`${x.truck_no}-${x.vehicle}`}><th>{x.truck_no || '?'} <span className="note">{x.vehicle}</span></th><td>{x.count} visit{x.count > 1 ? 's' : ''}</td><td>{dollars(x.cost)}</td></tr>
              ))}</tbody>
            </table>
          )}
          <p className="note">{Object.entries(m.byService).filter(([, v]) => v).map(([k, v]) => `${SERVICE[k] || k} ${dollars(v)}`).join(' · ')}</p>
        </section>
        <section className="panel">
          <h2 className="fin-h2">Recent maintenance</h2>
          {entries.length === 0 ? <p className="note">Nothing in the last 12 months.</p> : (
            <ul className="tr-entries">{entries.slice(0, 25).map((e) => (
              <li key={e.id}><span className="pill">{SERVICE[e.service] || 'Maintenance'}</span>
                <span className="tr-entry-main"><b>{usDate(e.day)}</b> · truck {e.truck_no || '?'} · {e.text}{e.cost ? ` · ${dollars(e.cost, true)}` : ''}{e.miles ? ` · ${mi(e.miles)} mi` : ''}{e.by ? <span className="note"> · {e.by}</span> : null}</span></li>
            ))}</ul>
          )}
        </section>
      </div>
      {canSetRules && <Rules rules={m.rules} />}
    </div>
  );
}
