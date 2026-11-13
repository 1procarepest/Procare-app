'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Switches({ settings }) {
  const [rows, setRows] = useState(settings);
  const [error, setError] = useState('');
  const [test, setTest] = useState({ busy: false, text: '', bad: false });

  async function sendTest() {
    setTest({ busy: true, text: '', bad: false });
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', id: 'test' }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.sent) setTest({ busy: false, text: `Sent to ${body.to} from ${body.from}${body.replyTo ? `, replies to ${body.replyTo}` : ''}. Check that inbox (and spam).`, bad: false });
      else setTest({ busy: false, text: body.problem || body.message || `Not sent (error ${res.status}).`, bad: true });
    } catch {
      setTest({ busy: false, text: 'Couldn’t reach the app. Check your connection and try again.', bad: true });
    }
  }

  async function toggle(key, enabled) {
    setError('');
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, enabled } : r)));
    const { error: err } = await createClient().from('notification_settings').update({ enabled }).eq('key', key);
    if (err) {
      setError(err.message);
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, enabled: !enabled } : r)));
    }
  }

  return (
    <section className="section">
      <div className="admin-head">
        <h1>Email settings</h1>
        <p className="note">Turn each automatic email on or off. Emails start sending once that part of the app is switched on.</p>
      </div>
      <ul className="switches">
        {rows.map((r) => (
          <li key={r.key}>
            <label className="switch">
              <input type="checkbox" role="switch" checked={r.enabled} onChange={(e) => toggle(r.key, e.target.checked)} />
              <span>{r.label}</span>
              <span className="note">{r.enabled ? 'On' : 'Off'}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="panel" style={{ maxWidth: 560, marginTop: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Check that emails send</h2>
        <p className="note">Sends a test email to you and shows what happened.</p>
        <div className="panel-buttons">
          <button className="btn" type="button" disabled={test.busy} onClick={sendTest}>{test.busy ? 'Sending…' : 'Send a test email'}</button>
        </div>
        {test.text && <p className={test.bad ? 'error' : 'ok'} role="status">{test.text}</p>}
      </div>
    </section>
  );
}
