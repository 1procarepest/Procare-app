'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { usDate } from '@/lib/trucks';
import DriverEditor, { EmailStatus, sendDriverNotice } from './DriverEditor';
import OpsHero from '../OpsHero';

const name = (p) => `${p.first_name} ${p.last_name}`;

export default function DriversView({ d, verify }) {
  const router = useRouter();
  const [office, setOffice] = useState('all');
  const [show, setShow] = useState('drivers');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const people = d.people || [];
  const agent = d.agent || {};

  const drivers = people.filter((p) => p.approved_driver);
  const notApproved = people.filter((p) => !p.approved_driver && (p.trucks || []).length);
  const noLicense = drivers.filter((p) => !p.has_license);
  const waiting = people.filter((p) => p.last_event && !p.last_event.emailed_at);
  const SHOW = [
    { key: 'drivers', label: 'Approved drivers', list: drivers },
    { key: 'trucks', label: 'In a truck, not approved', list: notApproved },
    { key: 'nolicense', label: 'No license on file', list: noLicense },
    { key: 'everyone', label: 'Everyone', list: people },
  ];
  const base = SHOW.find((s) => s.key === show)?.list || drivers;
  const list = base.filter((p) => (office === 'all' || (p.office || 'none') === office)
    && (!q || `${name(p)} ${(p.trucks || []).map((t) => t.truck_no).join(' ')}`.toLowerCase().includes(q.toLowerCase())));

  const sendList = async () => {
    if (!window.confirm(`Email ${agent.name || 'the insurance agent'} the full list of ${drivers.length} approved drivers (names, birth dates and licenses)?`)) return;
    setBusy(true); setM(null);
    const { data: ev, error } = await createClient().rpc('queue_driver_list');
    setM(error ? { ok: false, text: error.message } : await sendDriverNotice(ev));
    setBusy(false); router.refresh();
  };
  const cols = d.details ? 6 : 4;

  return (
    <div className="ops-fun">
      <OpsHero title="The" em="drivers" bug="spider">Who is on the company auto policy. Adding or taking someone off emails {agent.name || 'the insurance agent'}.</OpsHero>
      {verify && <p className="note tr-verify">License numbers and the driver switch are behind the authenticator step. <a href={verify}>Verify to see them</a>.</p>}

      <div className="fin-tiles">
        <div className="fin-tile"><span className="note">Approved drivers</span><strong>{drivers.length}</strong>
          <small className="note">{OFFICES.map((o) => `${o.name.replace('Atlanta ', '')} ${drivers.filter((p) => p.office === o.key).length}`).join(' · ')}</small></div>
        <div className={`fin-tile${notApproved.length ? ' drv-warn' : ''}`}><span className="note">In a truck, not approved</span><strong>{notApproved.length}</strong>
          <small className="note">{notApproved.length ? 'Driving a company truck without being on the policy' : 'Every truck driver is approved'}</small></div>
        <div className={`fin-tile${noLicense.length ? ' drv-warn' : ''}`}><span className="note">No license on file</span><strong>{noLicense.length}</strong>
          <small className="note">Approved drivers missing a license or birth date</small></div>
        {waiting.length > 0 && <div className="fin-tile drv-warn"><span className="note">Emails not sent</span><strong>{waiting.length}</strong><small className="note">Open the person to send it</small></div>}
      </div>

      <div className="chips tr-filters">
        {SHOW.map((s) => <button key={s.key} type="button" className={`chip${show === s.key ? ' on' : ''}`} onClick={() => setShow(s.key)}>{s.label} <span className="tr-count">{s.list.length}</span></button>)}
      </div>
      <div className="tr-controls">
        <div className="chips">
          {[['all', 'All offices'], ...OFFICES.map((o) => [o.key, o.name])].map(([k, label]) => (
            <button key={k} type="button" className={`chip${office === k ? ' on' : ''}`} onClick={() => setOffice(k)}>{label}</button>
          ))}
        </div>
        <input type="search" className="tr-search" placeholder="Name or truck #…" value={q} onChange={(e) => setQ(e.target.value)} />
        {d.details && <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={sendList}>Send {(agent.name || 'insurance').split(' ')[0]} the full list</button>}
      </div>
      {d.last_list && <p className="note">Full list last {d.last_list.emailed_at ? `sent ${usDate(d.last_list.emailed_at.slice(0, 10))}` : `not sent: ${d.last_list.email_result || 'waiting'}`}.</p>}
      {m && <p className={m.ok ? 'ok' : 'error'} role="status">{m.text}</p>}

      <div className="tr-scroll">
        <table className="ops-table tr-table">
          <thead><tr><th>Name</th><th>Office</th><th>Truck</th>{d.details && <><th>License</th><th>Born</th></>}<th>Driver</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={cols} className="note">Nobody here.</td></tr>}
            {list.map((p) => (
              <Fragment key={p.id}>
                <tr className={`tr-row${open === p.id ? ' open' : ''}`} onClick={() => d.details && setOpen(open === p.id ? null : p.id)}>
                  <th scope="row">{d.details ? <button type="button" className="linklike">{name(p)}</button> : name(p)}</th>
                  <td>{OFFICE_NAME[p.office]?.replace('Atlanta ', '') || '—'}</td>
                  <td>{(p.trucks || []).map((t) => t.truck_no).join(', ') || '—'}</td>
                  {d.details && <><td>{p.license_number ? `${p.license_state || ''} ${p.license_number}` : <span className="error">missing</span>}</td><td>{usDate(p.birth_date) || '—'}</td></>}
                  <td>
                    <span className={`pill ${p.approved_driver ? 'tr-st-active' : (p.trucks || []).length ? 'tr-st-for_sale' : ''}`}>{p.approved_driver ? 'Approved' : 'Not approved'}</span>
                    {p.last_event && !p.last_event.emailed_at && <span className="tr-vin"><EmailStatus ev={p.last_event} agent={agent.name} /></span>}
                  </td>
                </tr>
                {open === p.id && <tr className="tr-open"><td colSpan={cols}><div className="tr-card"><DriverEditor p={p} agent={agent} /></div></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
