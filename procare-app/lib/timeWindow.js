import { clock } from './labels';

/**
 * How FieldRoutes shows a job's time: "AT" for anytime jobs, otherwise the window ("8–10 AM").
 * timeWindow is FieldRoutes' own label: anything starting with AT/Any means anytime;
 * AM/PM windows show as is; timed jobs show their start and end.
 */
export function windowLabel(tw, start, end) {
  const w = String(tw || '').trim();
  if (/^(at|any)/i.test(w)) return 'AT';
  if (/^(am|pm)$/i.test(w)) return w.toUpperCase();
  if (!start) return w || '—';
  const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  if (end && mins(end) - mins(start) >= 8 * 60) return 'AT';       // an all-day window is an anytime job
  if (!end || end === start) return clock(start);
  const s = clock(start), e = clock(end);
  const sameHalf = s.slice(-2) === e.slice(-2);
  return `${sameHalf ? s.slice(0, -3) : s}–${e}`;
}
