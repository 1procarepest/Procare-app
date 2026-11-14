'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import Bug from '../../Bug';
import { createClient } from '@/lib/supabase/client';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import {
  DAY_SHORT, DEFAULT_TEMPLATE, PLAN_DAYS, assignment, buildPlan, changesSince, dayLabel, dayText,
  indexData, monthKey, monthName, monthRange, planText, routeLine, shiftMonth, techName, templateNames,
} from '@/lib/routeplan';

const href = (office, from, to) => `/ops/route-plan?office=${office}&from=${from}&to=${to}`;
const when = (t) => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function CopyButton({ text, label = 'Copy', className = '' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`rp-copy ${className}`.trim()}
      onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1800); } }}>
      {done ? 'Copied ✓' : label}
    </button>
  );
}

export default function RoutePlanView({ data, office, from, to, today, meId }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const ix = useMemo(() => indexData(data), [data]);
  const plan = useMemo(() => buildPlan(ix, office, from, to), [ix, office, from, to]);
  const text = useMemo(() => planText(plan, office, from, to), [plan, office, from, to]);
  const names = useMemo(() => templateNames(ix, office), [ix, office]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (label, fn) => {
    setBusy(true);
    setStatus('Saving…');
    const { error } = await fn();
    setBusy(false);
    if (error) { setStatus(`Couldn’t save: ${error.message}`); return false; }
    setStatus(`${label} saved.`);
    router.refresh();
    return true;
  };

  // Month arrows: a whole month either side of the month `from` is in
  const m = monthRange(from);
  const isMonth = m.from === from && m.to === to;
  const prev = monthRange(shiftMonth(from, -1));
  const next = monthRange(shiftMonth(from, 1));
  const nextMonth = monthRange(shiftMonth(today, 1));

  // Months in range and their "built" state for this office
  const months = [...new Set([monthKey(from), monthKey(to)])];
  const builds = months.map((mo) => {
    const b = ix.builds.find((x) => x.office === office && x.month === mo);
    return { month: mo, build: b, changes: b ? changesSince(ix, b, from, to) : [] };
  });

  const markBuilt = (mo) => save(`${monthName(mo)} built`, () => supabase.from('route_plan_builds')
    .upsert({ office, month: mo, built_at: new Date().toISOString(), built_by: meId }, { onConflict: 'office,month' }));

  const routes = plan.reduce((n, d) => n + d.groups.reduce((k, g) => k + g.routes.length, 0), 0);

  return (
    <>
      <div className="rc-top bug-band">
        <div>
          <p className="rc-kicker"><Link href="/ops">Operations</Link></p>
          <h1 className="rc-title">Route <em>plan</em></h1>
        </div>
        <p className="rc-updated">From the app’s schedules and approved time off · Sundays left out</p>
      </div>

      <div className="rc-controls">
        <div className="rc-step">
          <Link className="rc-arrow" href={href(office, prev.from, prev.to)} aria-label="Month before" scroll={false}>‹</Link>
          <span className="rc-range">{isMonth ? monthName(from) : 'Custom dates'}</span>
          <Link className="rc-arrow" href={href(office, next.from, next.to)} aria-label="Month after" scroll={false}>›</Link>
          {!(nextMonth.from === from && nextMonth.to === to) && (
            <Link className="ops-today" href={href(office, nextMonth.from, nextMonth.to)} scroll={false}>Next month</Link>
          )}
        </div>
        <div className="rp-dates">
          <input className="ops-date" type="date" value={from} aria-label="From"
            onChange={(e) => { const v = e.target.value; if (v) router.push(href(office, v, v > to ? v : to)); }} />
          <span>to</span>
          <input className="ops-date" type="date" value={to} min={from} aria-label="To"
            onChange={(e) => { const v = e.target.value; if (v && v >= from) router.push(href(office, from, v)); }} />
        </div>
        <nav className="ops-picks" aria-label="Office">
          {OFFICES.map((o) => (
            <Link key={o.key} href={href(o.key, from, to)} className={`ops-pick${o.key === office ? ' on' : ''}`} aria-current={o.key === office ? 'page' : undefined} scroll={false}>{o.name}</Link>
          ))}
        </nav>
      </div>

      {status && <p className={status.startsWith('Couldn') ? 'error' : 'ok'} role="status">{status}</p>}

      {/* Built in FieldRoutes, and changes since */}
      <section className="rp-builds">
        {builds.map(({ month, build, changes }) => (
          <div key={month} className={`rp-build${build ? ' done' : ''}`}>
            <div className="rp-build-head">
              <Bug kind="roach" size={26} color="var(--forest)" />
              <div>
                <h2>{OFFICE_NAME[office]} · {monthName(month)}</h2>
                {build
                  ? <p>Built in FieldRoutes {when(build.at)}{build.by ? ` by ${build.by}` : ''}. {changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} since — make these by hand in FieldRoutes:` : 'No schedule or time off changes since.'}</p>
                  : <p>Not built yet. When the routes are built in FieldRoutes Route Builder, mark it here. Changes after that show up below.</p>}
              </div>
              <button type="button" className={`btn btn-small${build ? ' btn-quiet' : ''}`} disabled={busy}
                onClick={() => { if (!build || window.confirm(`Mark ${monthName(month)} as built again now? The change list starts over.`)) markBuilt(month); }}>
                {build ? 'Built again' : 'Mark as built'}
              </button>
            </div>
            {changes.length > 0 && (
              <ul className="rp-changes">
                {changes.map((c, i) => <li key={i}><span className="rp-when">{when(c.at)}{c.by ? ` · ${c.by}` : ''}</span>{c.text}</li>)}
              </ul>
            )}
          </div>
        ))}
      </section>

      {/* The plan */}
      <div className="ops-heading rp-heading">
        <div>
          <h2>{OFFICE_NAME[office]} routes</h2>
          <p>{plan.length} days · {routes} routes. Everyone is on {DEFAULT_TEMPLATE} unless the office changed it below. “block” = block those spots.</p>
        </div>
        <CopyButton text={text} label="Copy whole plan" className="rp-copy-all" />
      </div>

      <div className="rp-days">
        {plan.map((d) => (
          <article key={d.day} className="rp-day">
            <header>
              <h3>{dayLabel(d.day)}</h3>
              <CopyButton text={dayText(d)} />
            </header>
            {!d.groups.length && <p className="ops-none">No routes</p>}
            {d.groups.map((g) => (
              <div key={g.template} className="rp-group">
                <p className={`rp-template${g.template === DEFAULT_TEMPLATE ? '' : ' other'}`}>{g.template} <span>{g.routes.length}</span></p>
                <ul>
                  {g.routes.map((r) => {
                    const [name, ...rest] = routeLine(r, g.template).split(' · ');
                    return <li key={r.id} className={r.blocks.length || r.partial ? 'flag' : ''}><b>{name}</b>{rest.length > 0 && <span> · {rest.join(' · ')}</span>}</li>;
                  })}
                </ul>
              </div>
            ))}
            {d.off.length > 0 && <p className="rp-off">Time off: {d.off.join(', ')}</p>}
          </article>
        ))}
      </div>

      <datalist id="rp-templates">{names.map((n) => <option key={n} value={n} />)}</datalist>

      <UsualRoutes ix={ix} office={office} save={save} busy={busy} supabase={supabase} />
      <OneDay ix={ix} office={office} from={from} to={to} save={save} busy={busy} supabase={supabase} />
    </>
  );
}

/** Each tech's usual template per weekday (and which office they route in). */
function UsualRoutes({ ix, office, save, busy, supabase }) {
  const [open, setOpen] = useState(false);
  const techs = ix.techs.filter((t) => t.office === office || PLAN_DAYS.some((wd) => ix.usual[`${t.id}|${wd}`]?.office === office));

  const write = (t, wd, template, routeOffice) => {
    const tpl = (template || '').trim() || DEFAULT_TEMPLATE;
    const off = !routeOffice || routeOffice === t.office ? null : routeOffice;
    if (tpl === DEFAULT_TEMPLATE && !off) {
      return supabase.from('route_plan_usual').delete().eq('employee_id', t.id).eq('weekday', wd);
    }
    return supabase.from('route_plan_usual').upsert({ employee_id: t.id, weekday: wd, template: tpl, office: off, updated_at: new Date().toISOString() });
  };

  const setTemplate = (t, wd, value) => {
    const cur = ix.usual[`${t.id}|${wd}`];
    const now = (value || '').trim() || DEFAULT_TEMPLATE;
    if (now === (cur?.template || DEFAULT_TEMPLATE)) return;
    save(`${techName(t)}’s ${DAY_SHORT[wd]}`, () => write(t, wd, now, cur?.office));
  };

  const setOffice = (t, wd, value) => {
    const cur = ix.usual[`${t.id}|${wd}`];
    save(`${techName(t)}’s ${DAY_SHORT[wd]} office`, () => write(t, wd, cur?.template, value));
  };

  return (
    <section className="rc-panel rp-panel">
      <button type="button" className="rc-panel-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h2>Usual routes · {OFFICE_NAME[office]}</h2>
        <span className="rc-panel-sum">Every week, until changed <span className={`rc-caret${open ? ' open' : ''}`}>▾</span></span>
      </button>
      {open && (
        <div className="rc-panel-body">
          <p className="note">Type or pick a template for a tech’s weekday. Leave it empty for {DEFAULT_TEMPLATE}. Pick another office for days they route there. Saves when you leave the box. Grey boxes are days off on their schedule.</p>
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead><tr><th>Tech</th>{PLAN_DAYS.map((wd) => <th key={wd}>{DAY_SHORT[wd]}</th>)}</tr></thead>
              <tbody>
                {techs.map((t) => (
                  <tr key={t.id}>
                    <th scope="row">{techName(t)}{t.office !== office && <small> ({OFFICE_NAME[t.office]})</small>}</th>
                    {PLAN_DAYS.map((wd) => {
                      const u = ix.usual[`${t.id}|${wd}`];
                      const works = !!ix.sched[`${t.id}|${wd}`];
                      const here = (u?.office || t.office);
                      return (
                        <td key={`${wd}-${u?.template || ''}-${here}`} className={works ? '' : 'idle'}>
                          <input list="rp-templates" defaultValue={u?.template || ''} placeholder={DEFAULT_TEMPLATE} disabled={busy}
                            aria-label={`${techName(t)} ${DAY_SHORT[wd]} template`}
                            onBlur={(e) => setTemplate(t, wd, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                          <select value={here} disabled={busy} aria-label={`${techName(t)} ${DAY_SHORT[wd]} office`}
                            onChange={(e) => setOffice(t, wd, e.target.value)}>
                            {OFFICES.map((o) => <option key={o.key} value={o.key}>{o.name.replace('Atlanta ', '')}</option>)}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/** One-day changes: a different template or office for one tech on one date. */
function OneDay({ ix, office, from, to, save, busy, supabase }) {
  const [tech, setTech] = useState('');
  const [day, setDay] = useState(from);
  const [template, setTemplate] = useState('');
  const [where, setWhere] = useState(office);

  const list = Object.values(ix.days)
    .filter((d) => d.day >= from && d.day <= to)
    .filter((d) => { const t = ix.byId[d.id]; return t && ((d.office || t.office) === office || t.office === office); })
    .sort((a, b) => a.day.localeCompare(b.day));

  const add = async (e) => {
    e.preventDefault();
    const t = ix.byId[tech];
    if (!t || !day) return;
    const ok = await save(`${techName(t)} on ${dayLabel(day)}`, () => supabase.from('route_plan_days').upsert({
      employee_id: t.id, day, template: template.trim() || DEFAULT_TEMPLATE,
      office: where === t.office ? null : where, updated_at: new Date().toISOString(),
    }));
    if (ok) setTemplate('');
  };

  const pickTech = (id) => {
    setTech(id);
    const t = ix.byId[id];
    if (t && day) setWhere(assignment(ix, t, day).office);
  };

  return (
    <section className="rc-panel rp-panel">
      <div className="rc-panel-head as-div"><h2>One-day changes</h2><span className="rc-panel-sum">{list.length} in these dates</span></div>
      <div className="rc-panel-body">
        <form className="rp-oneday" onSubmit={add}>
          <label>Tech
            <select value={tech} onChange={(e) => pickTech(e.target.value)} required>
              <option value="">Pick a tech</option>
              {OFFICES.map((o) => (
                <optgroup key={o.key} label={o.name}>
                  {ix.techs.filter((t) => t.office === o.key).map((t) => <option key={t.id} value={t.id}>{techName(t)}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label>Date<input type="date" value={day} min={from} max={to} onChange={(e) => setDay(e.target.value)} required /></label>
          <label>Template<input list="rp-templates" value={template} placeholder={DEFAULT_TEMPLATE} onChange={(e) => setTemplate(e.target.value)} /></label>
          <label>Office
            <select value={where} onChange={(e) => setWhere(e.target.value)}>
              {OFFICES.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn-small" disabled={busy || !tech}>Save day</button>
        </form>
        {list.length > 0 && (
          <ul className="rp-list">
            {list.map((d) => {
              const t = ix.byId[d.id];
              return (
                <li key={`${d.id}|${d.day}`}>
                  <span><b>{dayLabel(d.day)}</b> · {techName(t)} · {d.template}{d.office && d.office !== t.office ? ` · in ${OFFICE_NAME[d.office]}` : ''}</span>
                  <button type="button" className="rp-remove" disabled={busy}
                    onClick={() => save(`Removed ${techName(t)} on ${dayLabel(d.day)}`, () => supabase.from('route_plan_days').delete().eq('employee_id', d.id).eq('day', d.day))}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
