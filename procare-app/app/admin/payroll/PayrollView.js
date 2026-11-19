'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, clock, shortDate } from '@/lib/labels';
import { KIND_LABEL, hrs, payPeriod, shiftPeriod } from '@/lib/payroll';
import Toggle from '../../Toggle';

const range = (a, b) => (a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);
const dayCount = (r) => `${r.days ? `${r.days} day${r.days === 1 ? '' : 's'}` : ''}${r.days && r.partDays ? ' + ' : ''}${r.partDays ? `${r.partDays} part day${r.partDays === 1 ? '' : 's'}` : ''}`;

/** Ally logs a sick day or a call-out for someone: approved right away (change 60). */
function MarkOut({ staff, today }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ who: '', kind: 'sick', from: today, to: today, part: false, s: '08:30', x: '12:30', pto: false, note: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  async function save(e) {
    e.preventDefault();
    if (!f.who) { setMsg('Pick who was out.'); return; }
    if (f.to < f.from) { setMsg('The last day is before the first day.'); return; }
    if (f.part && f.s >= f.x) { setMsg('The end time is before the start time.'); return; }
    setBusy(true); setMsg('');
    const { error } = await createClient().from('time_off_requests').insert({
      employee_id: f.who, kind: f.kind, start_date: f.from, end_date: f.part ? f.from : f.to,
      start_time: f.part ? f.s : null, end_time: f.part ? f.x : null, use_pto: f.pto, note: f.note.trim() || null,
    });
    setBusy(false);
    if (error) { setMsg(`Couldn’t save it: ${error.message}`); return; }
    setMsg('Saved.');
    setF((cur) => ({ ...cur, who: '', note: '' }));
    router.refresh();
  }

  if (!open) {
    return <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>Mark sick / called out</button>;
  }
  return (
    <form className="panel pr-mark" onSubmit={save}>
      <h3>Mark someone out</h3>
      <p className="note">Saved as approved right away and shows on the schedule and in this list.</p>
      <div className="pr-form">
        <div>
          <label htmlFor="pr-who">Who</label>
          <select id="pr-who" value={f.who} onChange={set('who')}>
            <option value="">Pick a person…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.office ? ` · ${OFFICE_NAME[s.office] || s.office}` : ''}</option>)}
          </select>
        </div>
        <div className="chips" role="group" aria-label="Reason">
          {['sick', 'called_out', 'time_off'].map((k) => (
            <button key={k} type="button" className={`chip${f.kind === k ? ' on' : ''}`} aria-pressed={f.kind === k} onClick={() => set('kind')(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <div className="pr-dates">
          <div><label htmlFor="pr-from">{f.part ? 'Day' : 'First day'}</label><input id="pr-from" type="date" value={f.from} onChange={set('from')} /></div>
          {!f.part && <div><label htmlFor="pr-to">Last day</label><input id="pr-to" type="date" value={f.to} min={f.from} onChange={set('to')} /></div>}
          {f.part && <div><label htmlFor="pr-s">From</label><input id="pr-s" type="time" step="900" value={f.s} onChange={set('s')} /></div>}
          {f.part && <div><label htmlFor="pr-x">To</label><input id="pr-x" type="time" step="900" value={f.x} onChange={set('x')} /></div>}
        </div>
        <Toggle checked={f.part} onChange={set('part')}><span>Part of a day</span></Toggle>
        <Toggle checked={f.pto} onChange={set('pto')}><span>Paid (use paid vacation time)</span></Toggle>
        <div><label htmlFor="pr-note">Note (optional)</label><input id="pr-note" type="text" value={f.note} onChange={set('note')} placeholder="e.g. Called in at 7:10 AM" /></div>
      </div>
      <div className="panel-buttons">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn btn-quiet" type="button" onClick={() => { setOpen(false); setMsg(''); }}>Close</button>
      </div>
      {msg && <p className={msg === 'Saved.' ? 'ok' : 'error'} role="status">{msg}</p>}
    </form>
  );
}

export default function PayrollView({ rows, staff, period, yearView, year, today }) {
  const [openId, setOpenId] = useState(null);
  const [copied, setCopied] = useState(false);
  const thisPeriod = payPeriod(today);
  const prev = shiftPeriod(period.from, -1);
  const next = shiftPeriod(period.from, 1);
  const paid = rows.reduce((t, r) => t + r.paidMin, 0);
  const unpaid = rows.reduce((t, r) => t + r.unpaidMin, 0);
  const title = yearView ? `${year}` : range(period.from, period.to);

  const text = [`Time off · ${title}`, ...rows.map((r) => `${r.p.first_name} ${r.p.last_name}: ${dayCount(r)} · paid vacation ${hrs(r.paidMin)} · unpaid ${hrs(r.unpaidMin)}${r.sick ? ` · sick ${r.sick}` : ''}${r.calledOut ? ` · called out ${r.calledOut}` : ''}`)].join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  return (
    <section className="section payroll">
      <div className="admin-head">
        <h1>Payroll time off</h1>
        <p className="note">
          Approved time off for the office team and technicians, in scheduled hours: a full day is that person’s usual
          hours that day, a part day is the time missed. Company holidays and days they weren’t scheduled don’t count.
        </p>
      </div>

      <div className="pr-controls">
        <nav className="rc-seg" aria-label="Show">
          <Link href="/admin/payroll" className={yearView ? '' : 'on'}>Pay period</Link>
          <Link href={`/admin/payroll?view=year&year=${year}`} className={yearView ? 'on' : ''}>Year</Link>
        </nav>
        <div className="rc-step">
          {yearView ? (
            <>
              <Link className="rc-arrow" href={`/admin/payroll?view=year&year=${year - 1}`} aria-label="Previous year" scroll={false}>‹</Link>
              <span className="rc-range">{year}</span>
              <Link className="rc-arrow" href={`/admin/payroll?view=year&year=${year + 1}`} aria-label="Next year" scroll={false}>›</Link>
            </>
          ) : (
            <>
              <Link className="rc-arrow" href={`/admin/payroll?from=${prev.from}`} aria-label="Previous pay period" scroll={false}>‹</Link>
              <span className="rc-range">{title}{period.from === thisPeriod.from ? ' (this pay period)' : ''}</span>
              <Link className="rc-arrow" href={`/admin/payroll?from=${next.from}`} aria-label="Next pay period" scroll={false}>›</Link>
              {period.from !== thisPeriod.from && <Link className="ops-today" href="/admin/payroll" scroll={false}>This period</Link>}
            </>
          )}
        </div>
        <MarkOut staff={staff} today={today} />
      </div>

      <p className="pr-sum">
        <b>{rows.length}</b> {rows.length === 1 ? 'person' : 'people'} out · paid vacation <b>{hrs(paid)}</b> · unpaid <b>{hrs(unpaid)}</b>
        {rows.length > 0 && <button type="button" className="link pr-copy" onClick={copy}>{copied ? 'Copied ✓' : 'Copy list'}</button>}
      </p>

      {rows.length === 0 ? <p className="note">Nobody had approved time off {yearView ? `in ${year}` : 'this pay period'}.</p> : (
        <div className="pay-scroll">
          <table className="ops-table pr-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Days off</th>
                <th scope="col">Paid vacation</th>
                <th scope="col">Unpaid</th>
                {yearView && <th scope="col">Times out</th>}
                <th scope="col">Sick</th>
                <th scope="col">Called out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.p.id}>
                  <tr className="pr-row">
                    <th scope="row">
                      <button type="button" className="link pr-name" aria-expanded={openId === r.p.id} onClick={() => setOpenId(openId === r.p.id ? null : r.p.id)}>
                        {r.p.first_name} {r.p.last_name}
                      </button>
                      <small>{OFFICE_NAME[r.p.office] || ''}{r.p.active ? '' : ' · no longer active'}</small>
                    </th>
                    <td>{dayCount(r)}</td>
                    <td>{r.paidMin ? hrs(r.paidMin) : '–'}</td>
                    <td>{r.unpaidMin ? hrs(r.unpaidMin) : '–'}</td>
                    {yearView && <td>{r.times}</td>}
                    <td>{r.sick || '–'}</td>
                    <td>{r.calledOut || '–'}</td>
                  </tr>
                  {openId === r.p.id && (
                    <tr className="pr-detail">
                      <td colSpan={yearView ? 7 : 6}>
                        <ul>
                          {r.entries.map((x) => (
                            <li key={x.id}>
                              <b>{range(x.a, x.b)}</b>{x.s ? ` · ${clock(x.s)}–${clock(x.x)}` : ''} · {KIND_LABEL[x.kind]} · {x.pto ? 'paid vacation' : 'unpaid'} · {hrs(x.min)}
                              {x.note && <span className="note"> · {x.note}</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="calc-hint">Tap a name to see each day off. Pay periods run the 1st–15th and the 16th–end of the month.</p>
    </section>
  );
}
