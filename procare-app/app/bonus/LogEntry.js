'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { shortDate } from '@/lib/labels';

const STATUS = { pending: 'Waiting on Ally', approved: 'Approved', rejected: 'Turned down' };

/** Log proof toward a goal (posts, ad spend, a finished project), and the entries so far. Ally approves each one. */
export default function LogEntry({ goal, entries, meId, today, open }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const spend = goal.kind === 'cost_per_customer';
  const project = goal.kind === 'project';
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ day: today, qty: spend ? '' : '1', link: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    const qty = project ? 1 : Number(f.qty);
    if (!(qty > 0)) { setMsg(spend ? 'Enter how much was spent.' : 'Enter how many.'); return; }
    if (!f.link.trim() && !f.note.trim()) { setMsg('Add a link to the proof or a note so Ally can check it.'); return; }
    setBusy(true);
    setMsg('');
    const { data, error } = await sb.from('bonus_entries')
      .insert({ goal_id: goal.id, day: f.day, qty, link: f.link.trim() || null, note: f.note.trim() || null }).select('id').single();
    if (error) { setBusy(false); setMsg(`Couldn’t save: ${error.message}`); return; }
    await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'bonus_entry', id: data.id }) }).catch(() => {});
    setBusy(false);
    setShow(false);
    setF({ day: today, qty: spend ? '' : '1', link: '', note: '' });
    setMsg('Saved. Ally will approve it.');
    router.refresh();
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    await sb.from('bonus_entries').delete().eq('id', id);
    router.refresh();
  };

  return (
    <div className="bn-log">
      {entries.length > 0 && (
        <ul className="bn-entries">
          {entries.map((e) => (
            <li key={e.id}>
              <span>{shortDate(e.day)} · {project ? 'Done' : spend ? `$${Number(e.qty).toFixed(2)} ad spend` : `${Number(e.qty)}`}
                {e.note ? ` · ${e.note}` : ''}{e.link ? <> · <a href={e.link} target="_blank" rel="noreferrer">proof</a></> : null}
                {e.review_note ? <small> · Ally: {e.review_note}</small> : null}</span>
              <span className={`pill${e.status === 'approved' ? ' pill-good' : e.status === 'rejected' ? ' pill-bad' : ''}`}>{STATUS[e.status]}</span>
              {e.status === 'pending' && e.employee_id === meId && open && <button type="button" className="link" onClick={() => remove(e.id)}>Delete</button>}
            </li>
          ))}
        </ul>
      )}
      {open && !show && <button type="button" className="btn btn-small btn-quiet" onClick={() => setShow(true)}>{project ? 'Mark done (with proof)' : spend ? 'Log ad spend' : 'Log it'}</button>}
      {open && show && (
        <div className="bn-log-form">
          <div className="calc-row">
            <label className="calc-field">Date<input type="date" value={f.day} max={today} onChange={(e) => setF({ ...f, day: e.target.value })} /></label>
            {!project && (
              <label className="calc-field">{spend ? 'Spent ($)' : 'How many'}
                <input type="number" min="0" step={spend ? '0.01' : '1'} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
            )}
          </div>
          <label className="calc-field">Link to proof<input value={f.link} placeholder="Post, ad dashboard or screenshot link" onChange={(e) => setF({ ...f, link: e.target.value })} /></label>
          <label className="calc-field">Note<input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <div className="panel-buttons">
            <button type="button" className="btn btn-small" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.startsWith('Saved') ? 'ok' : 'error'}>{msg}</p>}
    </div>
  );
}
