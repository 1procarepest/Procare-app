'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import OpsHero from '../../ops/OpsHero';

const when = (t) => (t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function Connection({ connection: c, configured }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const call = async (path, body, label) => {
    setBusy(label); setMsg(null);
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await res.json().catch(() => ({}));
    setBusy('');
    setMsg(j.ok ? { ok: true, text: label === 'sync' ? `Copied ${j.months} month${j.months === 1 ? '' : 's'} from QuickBooks (${j.lines} lines).` : 'Disconnected.' } : { ok: false, text: j.error || `Error ${res.status}` });
    router.refresh();
  };
  return (
    <section className="panel fin-conn">
      <h2>QuickBooks</h2>
      {c.connected ? (
        <>
          <p><b>Connected</b>{c.company ? ` to ${c.company}` : ''} on {when(c.connected_at)}.</p>
          <p className="note">Last copied {c.last_sync_at ? when(c.last_sync_at) : 'never'}. Refreshes every morning (the last 3 months, for late entries).
            {c.refresh_expires_at ? ` The sign-in stays good until ${when(c.refresh_expires_at)} and renews itself while the daily refresh runs.` : ''}</p>
          {c.last_sync_error && <p className="error">Last refresh failed: {c.last_sync_error}</p>}
          <div className="panel-buttons">
            <button className="btn" type="button" disabled={!!busy} onClick={() => call('/api/qbo/sync', { months: 3 }, 'sync')}>{busy === 'sync' ? 'Copying…' : 'Sync now'}</button>
            <button className="btn btn-quiet" type="button" disabled={!!busy} onClick={() => call('/api/qbo/sync', { months: 24 }, 'sync')}>Copy the last 2 years</button>
            <button className="btn btn-quiet" type="button" disabled={!!busy}
              onClick={() => { if (window.confirm('Disconnect QuickBooks? The numbers already copied stay.')) call('/api/qbo/disconnect', {}, 'disconnect'); }}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p>Not connected. Connecting opens QuickBooks: sign in there and pick the Procare company. Your QuickBooks password never comes to this app.</p>
          {!configured && <p className="error">The app’s QuickBooks keys aren’t set in Vercel yet (QBO_CLIENT_ID, QBO_CLIENT_SECRET), so Connect won’t work until they are.</p>}
          <div className="panel-buttons"><a className="btn" href="/api/qbo/connect">Connect QuickBooks</a></div>
        </>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}

function Picker({ label, options, picked, onChange, empty }) {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="fin-picker">
      <div className="fin-picker-head"><b>{label}</b> <span className="note">{picked.length} picked</span></div>
      {options.length > 8 && <input type="search" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Filter ${label}`} />}
      {options.length === 0 ? <p className="note">{empty}</p> : (
        <div className="chips">
          {shown.map((o) => {
            const on = picked.includes(o);
            return <button key={o} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}>{o}</button>;
          })}
        </div>
      )}
    </div>
  );
}

function Channel({ ch, accounts, sources }) {
  const router = useRouter();
  const [f, setF] = useState({ name: ch.name, qbo_accounts: ch.qbo_accounts || [], fr_sources: ch.fr_sources || [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = f.name !== ch.name || JSON.stringify(f.qbo_accounts) !== JSON.stringify(ch.qbo_accounts || []) || JSON.stringify(f.fr_sources) !== JSON.stringify(ch.fr_sources || []);
  const save = async () => {
    setBusy(true); setMsg('');
    const { error } = await createClient().from('marketing_channels').update({ ...f, name: f.name.trim() || ch.name, updated_at: new Date().toISOString() }).eq('id', ch.id);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    router.refresh();
  };
  const remove = async () => {
    if (!window.confirm(`Remove the “${ch.name}” channel?`)) return;
    const { error } = await createClient().from('marketing_channels').delete().eq('id', ch.id);
    if (error) { setMsg(error.message); return; }
    router.refresh();
  };
  return (
    <article className="fin-channel">
      <div className="fin-channel-head">
        <input type="text" value={f.name} onChange={(e) => setF((c) => ({ ...c, name: e.target.value }))} aria-label="Channel name" />
        <button type="button" className="link" onClick={remove}>Remove</button>
      </div>
      <Picker label="Its cost: QuickBooks accounts" options={accounts} picked={f.qbo_accounts}
        onChange={(v) => setF((c) => ({ ...c, qbo_accounts: v }))} empty="No QuickBooks accounts yet: connect QuickBooks first." />
      <Picker label="Its customers: FieldRoutes lead sources" options={sources} picked={f.fr_sources}
        onChange={(v) => setF((c) => ({ ...c, fr_sources: v }))} empty="No lead sources found in FieldRoutes." />
      {dirty && <div className="panel-buttons"><button className="btn btn-small" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>}
      {msg && <p className="error">{msg}</p>}
    </article>
  );
}

export default function FinanceSettings({ connection, configured, channels, accounts, sources, notice }) {
  const router = useRouter();
  const [adding, setAdding] = useState('');
  const add = async (e) => {
    e.preventDefault();
    if (!adding.trim()) return;
    const { error } = await createClient().from('marketing_channels').insert({ name: adding.trim(), sort: channels.length + 1 });
    if (!error) { setAdding(''); router.refresh(); }
  };
  return (
    <section className="section">
      <OpsHero kicker="Finance" title="Finance" em="settings" bug="cricket">C-Suite and the President only. The QuickBooks link and how each marketing channel is counted.</OpsHero>
      {notice && <p className={notice.ok ? 'ok' : 'error'} role="status">{notice.text}</p>}
      <Connection connection={connection} configured={configured} />

      <h2 className="fin-h2">Marketing channels</h2>
      <p className="note">For each channel, pick the QuickBooks accounts its cost is booked to and the FieldRoutes lead sources its customers come in under. Cost per customer = that spend ÷ those new customers.</p>
      {channels.map((ch) => <Channel key={`${ch.id}-${ch.updated_at}`} ch={ch} accounts={accounts} sources={sources} />)}
      <form className="fin-add" onSubmit={add}>
        <input type="text" placeholder="New channel, e.g. Angi" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="New channel name" />
        <button className="btn btn-small" type="submit">Add channel</button>
      </form>
    </section>
  );
}
