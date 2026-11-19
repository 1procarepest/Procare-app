'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { HOLIDAYS } from '@/lib/holidays';
import Toggle from '../../Toggle';

const DATE_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const show = (ymd) => DATE_FMT.format(new Date(`${ymd}T12:00:00Z`));

// The next time a holiday comes around (this year's date, or next year's once it has passed)
function nextDate(key, today) {
  const h = HOLIDAYS.find((x) => x.key === key);
  if (!h) return null;
  const y = Number(today.slice(0, 4));
  const d = h.date(y);
  return d >= today ? d : h.date(y + 1);
}

export default function HolidaySwitches({ rows: start, today }) {
  const [rows, setRows] = useState(start);
  const [error, setError] = useState('');

  async function toggle(key, enabled) {
    setError('');
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, enabled } : r)));
    const { error: err } = await createClient().from('company_holidays').update({ enabled, updated_at: new Date().toISOString() }).eq('key', key);
    if (err) {
      setError(err.message);
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, enabled: !enabled } : r)));
    }
  }

  const on = rows.filter((r) => r.enabled).length;

  return (
    <section className="section">
      <div className="admin-head">
        <h1>Company holidays</h1>
        <p className="note">
          Holidays that are on are a company day off for everyone (office, technicians and sales): they show as the
          holiday on every schedule and the route plan, with no time-off request needed. Sales reps may still choose to work.
          {' '}{on} of {rows.length} on.
        </p>
      </div>
      <ul className="switches">
        {rows.map((r) => {
          const next = nextDate(r.key, today);
          return (
            <li key={r.key}>
              <Toggle className="switch" checked={r.enabled} onChange={(v) => toggle(r.key, v)}>
                <span>{r.name}{next && <small className="holiday-date">Next: {show(next)}</small>}</span>
                <span className="note">{r.enabled ? 'Day off' : 'Open'}</span>
              </Toggle>
            </li>
          );
        })}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
