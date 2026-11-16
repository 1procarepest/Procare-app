'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import { KIND_LABEL } from '@/lib/reports';
import Picker from '../Picker';

const KINDS = [{ v: 'ride_along', label: 'Ride-along' }, { v: 'follow_behind', label: 'Follow-behind' }];

/**
 * Log a ride-along or follow-behind that was already done (e.g. on the old Google Forms) so it counts toward this
 * quarter's goal. No answers; nothing reaches the tech. Bonus managers can log one for any lead or manager.
 */
export default function PastReport({ techs, leaders, meId, canManage, today, earliest }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const blank = { tech: '', kind: 'ride_along', day: today, author: meId };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState([]);

  const techOptions = techs.map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}`, group: OFFICE_NAME[t.office] || 'No office' }));
  const leaderOptions = leaders.map((p) => ({ value: p.id, label: `${p.first_name} ${p.last_name}${p.id === meId ? ' (me)' : ''}`, group: OFFICE_NAME[p.office] || 'No office' }));

  const save = async () => {
    if (!f.tech) { setMsg('Pick the technician.'); return; }
    setBusy(true);
    setMsg('');
    const { error } = await sb.rpc('log_past_report', { p_tech: f.tech, p_kind: f.kind, p_day: f.day, p_author: f.author === meId ? null : f.author });
    setBusy(false);
    if (error) { setMsg(`Couldn’t log it: ${error.message}`); return; }
    const t = techs.find((x) => x.id === f.tech);
    setLog((l) => [`${KIND_LABEL[f.kind]} · ${t?.first_name} ${t?.last_name} · ${shortDate(f.day)}`, ...l]);
    setF({ ...f, tech: '' });   // keep the type, date and manager for the next one
    router.refresh();
  };

  if (!open) {
    return <button type="button" className="btn btn-small btn-quiet" onClick={() => setOpen(true)}>Log a past report</button>;
  }
  return (
    <div className="rf-past">
      <p className="rf-q-title">Log a report that was already done</p>
      <p className="calc-hint">For ride-alongs and follow-behinds done before the app had the forms. It counts toward this quarter’s goal as “told the tech.” No answers needed, and nothing shows on the tech’s home page.</p>
      {canManage && (
        <div className="calc-field"><span className="rf-label">Done by</span>
          <Picker label="Done by" value={f.author} options={leaderOptions} onChange={(v) => setF({ ...f, author: v })} />
        </div>
      )}
      <div className="row">
        <div className="calc-field"><span className="rf-label">Technician</span>
          <Picker label="Technician" value={f.tech} options={techOptions} placeholder="Pick a technician…" onChange={(v) => setF({ ...f, tech: v })} />
        </div>
        <label className="calc-field"><span className="rf-label">Date</span>
          <input type="date" value={f.day} min={earliest} max={today} onChange={(e) => setF({ ...f, day: e.target.value })} />
        </label>
      </div>
      <div className="rf-choice">
        {KINDS.map((k) => <button key={k.v} type="button" className={`cp-chip${f.kind === k.v ? ' on' : ''}`} onClick={() => setF({ ...f, kind: k.v })}>{k.label}</button>)}
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
      {log.length > 0 && <ul className="rf-past-log">{log.map((l, i) => <li key={i}>✓ {l}</li>)}</ul>}
      <div className="panel-buttons">
        <button type="button" className="btn btn-small" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Log it'}</button>
        <button type="button" className="btn btn-small btn-quiet" onClick={() => { setOpen(false); setLog([]); setMsg(''); setF(blank); }}>Done</button>
      </div>
    </div>
  );
}
