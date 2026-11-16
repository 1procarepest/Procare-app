'use client';

// Reports filled out in the field: drafts are kept on the phone as they're typed, and a report sent with no
// signal waits here and goes out when the signal is back (submit_field_report saves each id once, so sending
// twice is safe). Browser storage can be unavailable (private mode); then this quietly does nothing.

const DRAFT = (kind) => `procare-report-draft-${kind}`;
const QUEUE = 'procare-report-outbox';

function read(key, fallback) {
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export const loadDraft = (kind) => read(DRAFT(kind), null);
export const saveDraft = (kind, form) => write(DRAFT(kind), form);
export const clearDraft = (kind) => write(DRAFT(kind), null);
export const queued = () => read(QUEUE, []);

/** Send one report: save it, then the emails. Returns { ok, offline, problem }. */
export async function sendReport(sb, report) {
  const { data: isNew, error } = await sb.rpc('submit_field_report', { p: report });
  if (error) {
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network|load failed/i.test(error.message || '');
    return { ok: false, offline, problem: error.message };
  }
  if (isNew) {
    await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'field_report', id: report.id }) }).catch(() => {});
  }
  return { ok: true };
}

export function enqueue(report) {
  write(QUEUE, [...queued().filter((r) => r.id !== report.id), report]);
}
export function unqueue(id) {
  write(QUEUE, queued().filter((r) => r.id !== id));
}

/** Try everything waiting. Returns how many went out. One refused for another reason stays, with the reason. */
export async function flush(sb) {
  let sent = 0;
  for (const r of queued()) {
    const res = await sendReport(sb, r);
    if (res.ok) { unqueue(r.id); sent += 1; continue; }
    if (res.offline) break;
    write(QUEUE, queued().map((x) => (x.id === r.id ? { ...x, problem: res.problem } : x)));
  }
  return sent;
}
