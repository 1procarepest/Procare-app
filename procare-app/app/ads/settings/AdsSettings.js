'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Toggle from '../../Toggle';
import SyncNow from '../SyncNow';

const when = (t) => (t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const fmtId = (id) => String(id).replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');

function Connection({ c, configured }) {
  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Ads? The numbers already copied stay.')) return;
    const res = await fetch('/api/gads/disconnect', { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setMsg(j.ok ? { ok: true, text: 'Disconnected.' } : { ok: false, text: j.error || `Error ${res.status}` });
    router.refresh();
  };
  return (
    <section className="panel fin-conn">
      <h2>Google Ads</h2>
      {c.connected ? (
        <>
          <p><b>Connected</b>{c.email ? ` as ${c.email}` : ''} on {when(c.connected_at)}.</p>
          <p className="note">Last copied {c.last_sync_at ? when(c.last_sync_at) : 'never'}. Refreshes every morning (the last 30 days, for credited leads and late spend).</p>
          {c.last_sync_error && <p className="error">Last copy had a problem: {c.last_sync_error}</p>}
          <div className="panel-buttons">
            <SyncNow days={30} label="Sync now" />
            <SyncNow days={365} label="Copy the last year" quiet />
            <button className="btn btn-small btn-quiet" type="button" onClick={disconnect}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p>Not connected. Connecting opens Google: sign in with the login that manages the Procare manager account (100-402-6960). Your Google password never comes to this app, and the app only reads numbers (ads and website): it can’t change ads, budgets or the website.</p>
          {!configured && <p className="error">The app’s Google keys aren’t set in Vercel yet (GADS_CLIENT_ID, GADS_CLIENT_SECRET), so Connect won’t work until they are.</p>}
          <div className="panel-buttons"><a className="btn" href="/api/gads/connect">Connect Google Ads</a></div>
        </>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}

function Accounts({ accounts, offices }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const setOffice = async (id, office) => {
    setErr('');
    const { error } = await createClient().rpc('set_ads_account_office', { p_customer: id, p_office: office });
    if (error) setErr(error.message); else router.refresh();
  };
  if (!accounts.length) return <p className="note">No ad accounts yet. Link the Google Guaranteed account to the manager account, then Sync now.</p>;
  return (
    <>
      <ul className="switches">
        {accounts.map((a) => (
          <li key={a.id} className="ads-acct">
            <span><b>{a.name}</b> <small className="note">{fmtId(a.id)}{a.status && a.status !== 'ENABLED' ? ` · ${a.status.toLowerCase()}` : ''}</small></span>
            <select value={a.office || ''} onChange={(e) => setOffice(a.id, e.target.value)} aria-label={`Office for ${a.name}`}>
              <option value="">Whole company</option>
              {offices.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {err && <p className="error">{err}</p>}
    </>
  );
}

function Sources({ sources, picked: start }) {
  const router = useRouter();
  const [picked, setPicked] = useState(start);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState(null);
  const dirty = JSON.stringify([...picked].sort()) !== JSON.stringify([...start].sort());
  const shown = sources.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));
  const save = async () => {
    const { error } = await createClient().rpc('set_ads_sources', { p_sources: picked });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved.' });
    if (!error) router.refresh();
  };
  return (
    <div className="fin-picker">
      {sources.length > 8 && <input type="search" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter lead sources" />}
      <div className="chips">
        {shown.map((o) => {
          const on = picked.includes(o);
          return <button key={o} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== o) : [...picked, o])}>{o}</button>;
        })}
      </div>
      {dirty && <div className="panel-buttons"><button className="btn btn-small" type="button" onClick={save}>Save</button></div>}
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </div>
  );
}

function Website({ properties, property, error, connected }) {
  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const pick = async (id) => {
    const p = properties.find((x) => x.id === id);
    const { error: err } = await createClient().rpc('set_ga_property', { p_id: id, p_name: p ? p.name : null });
    setMsg(err ? { ok: false, text: err.message } : { ok: true, text: 'Saved. Click Sync now to copy its numbers.' });
    if (!err) router.refresh();
  };
  if (!connected) return <p className="note">Connect Google first.</p>;
  if (error) return <p className="error">{error}</p>;
  if (!properties.length) return <p className="note">This Google login can’t see any Google Analytics property. Sign in at analytics.google.com to check, or add john@procarepest.com as a Viewer on the website’s property.</p>;
  return (
    <>
      <ul className="switches">
        <li className="ads-acct">
          <span><b>{property.name || 'Not picked yet'}</b>{property.id && <small className="note"> · property {property.id}</small>}</span>
          <select value={property.id || ''} onChange={(e) => pick(e.target.value)} aria-label="Website Analytics property">
            <option value="">Pick the website…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.account ? ` (${p.account})` : ''}</option>)}
          </select>
        </li>
      </ul>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </>
  );
}

function People({ people: start }) {
  const [people, setPeople] = useState(start);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const always = (p) => p.level === 'c_suite' || p.level === 'president';
  const set = async (id, on) => {
    setErr('');
    setPeople((list) => list.map((p) => (p.id === id ? { ...p, ads_access: on } : p)));
    const { error } = await createClient().rpc('set_ads_access', { p_employee: id, p_on: on });
    if (error) {
      setErr(error.message);
      setPeople((list) => list.map((p) => (p.id === id ? { ...p, ads_access: !on } : p)));
    }
  };
  const term = q.trim().toLowerCase();
  // People with access first, then everyone else when searching
  const shown = people.filter((p) => (term ? p.name.toLowerCase().includes(term) : p.ads_access || always(p)));
  return (
    <>
      <input type="search" placeholder="Find someone to add…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a person" className="ads-find" />
      <ul className="switches">
        {shown.map((p) => (
          <li key={p.id}>
            <Toggle className="switch" checked={always(p) || p.ads_access} disabled={always(p)} onChange={(v) => set(p.id, v)}>
              <span>{p.name}</span>
              <span className="note">{always(p) ? 'Always (C-Suite / President)' : p.ads_access ? 'Sees Ads' : 'No access'}</span>
            </Toggle>
          </li>
        ))}
        {shown.length === 0 && <li className="note">{term ? 'No one by that name.' : 'No one else has Ads access yet. Search for a name to add them.'}</li>}
      </ul>
      {err && <p className="error" role="alert">{err}</p>}
    </>
  );
}

export default function AdsSettings({ properties, property, propError, connection, configured, accounts, offices, sources, picked, people, notice }) {
  return (
    <section className="section">
      <div className="admin-head">
        <h1>Ads settings</h1>
        <p className="note">C-Suite and the President only.</p>
      </div>
      {notice && <p className={notice.ok ? 'ok' : 'error'} role="status">{notice.text}</p>}
      <Connection c={connection} configured={configured} />

      <h2 className="fin-h2">Ad accounts</h2>
      <p className="note">Every account linked under the Procare manager account. If an account only advertises for one office, pick the office so its cost per customer uses that office’s new customers.</p>
      <Accounts accounts={accounts} offices={offices} />

      <h2 className="fin-h2">Website (Google Analytics)</h2>
      <p className="note">Which Google Analytics property is procarepest.com. Its visits, sources, top pages and website leads show in Ads → Website.</p>
      <Website properties={properties} property={property} error={propError} connected={!!connection.connected} />

      <h2 className="fin-h2">Google lead sources in FieldRoutes</h2>
      <p className="note">New customers whose purchase came in under these lead sources count as Google customers (for cost per customer).</p>
      <Sources key={picked.join('|')} sources={sources} picked={picked} />

      <h2 className="fin-h2">Who sees Ads</h2>
      <p className="note">Turn this on for the people who run the ads. They see Ads (spend, leads, cost per lead and customer) and nothing in Finance.</p>
      <People people={people} />
    </section>
  );
}
