'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Switches({ settings }) {
  const [rows, setRows] = useState(settings);
  const [error, setError] = useState('');

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
    </section>
  );
}
