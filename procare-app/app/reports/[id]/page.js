import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { OFFICE_NAME, shortDate } from '@/lib/labels';
import { KIND_LABEL, SKILL_LABEL, answerLines } from '@/lib/reports';
import { getMe } from '@/lib/me';
import Bug from '@/app/Bug';
import ToldTech from './ToldTech';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const [{ data: r, error }, { data: truck }] = await Promise.all([
    supabase.from('field_reports')
      .select('*, tech:employees!field_reports_tech_id_fkey(first_name, last_name), author:employees!field_reports_author_id_fkey(first_name, last_name)')
      .eq('id', params.id).maybeSingle(),
    supabase.from('truck_issues').select('id, item, status, fixed_at').eq('report_id', params.id),
  ]);
  if (error) return <p className="error">The report couldn’t load: {error.message}</p>;
  if (!r) return <p className="note">That report isn’t here, or it’s not one you can see. <Link href="/reports">Back to reports</Link></p>;
  const tech = `${r.tech?.first_name || ''} ${r.tech?.last_name || ''}`.trim();
  return (
    <>
      <div className="rc-top brand-head brand-hero">
        <Bug kind={r.kind === 'ride_along' ? 'cricket' : 'spider'} size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker"><Link href="/reports">Reports</Link> · {KIND_LABEL[r.kind]}</p>
          <h1 className="rc-title">{tech}</h1>
          <p className="note">{shortDate(r.day)}{r.office ? ` · ${OFFICE_NAME[r.office]}` : ''} · by {r.author?.first_name} {r.author?.last_name}{r.customer ? ` · ${r.customer}` : ''}</p>
        </div>
      </div>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>Answers <small className="note">(managers only)</small></h2>
        {r.answers?.past && <p className="note">Logged after the fact (done before the app had the forms), so there are no answers. It counts toward the reports goal.</p>}
        {!r.answers?.past && <dl className="rf-answers">
          {answerLines(r.kind, r.answers).map(([q, v]) => <div key={q}><dt>{q}</dt><dd>{v}</dd></div>)}
        </dl>}
        {(truck || []).length > 0 && (
          <p className="note">Truck items: {truck.map((t) => `${t.item} (${t.status === 'fixed' ? `fixed ${shortDate(String(t.fixed_at).slice(0, 10))}` : 'open'})`).join(', ')}</p>
        )}
      </div></section>

      <section className="rc-panel rf-tech"><div className="rc-panel-body rf-sec">
        <h2>What {r.tech?.first_name || 'the tech'} sees</h2>
        {r.kind === 'follow_behind' && r.answers?.positive && <p><b>The customer said:</b> “{r.answers.positive}”</p>}
        {r.tech_praise && <p><b>What they did well:</b> {r.tech_praise}</p>}
        {r.improve?.length > 0 && <p><b>Where to improve:</b> {r.improve.map((k) => SKILL_LABEL[k] || k).join(', ')}</p>}
        <p><b>{r.kind === 'ride_along' ? 'What to work on' : 'One thing to work on'}:</b> {r.tech_note || <span className="note">nothing written.</span>}</p>
        <p className={r.told_tech ? 'ok' : 'rf-warn'}>
          {r.told_tech
            ? `${r.author?.first_name} told the tech.${r.tech_seen_at ? ` The tech tapped Got it on ${shortDate(new Date(r.tech_seen_at).toISOString().slice(0, 10))}.` : ' The tech hasn’t tapped Got it yet.'}`
            : 'The “I told the tech” switch is off, so the tech doesn’t see this and it doesn’t count toward a bonus.'}
        </p>
        {!r.told_tech && me?.id === r.author_id && (
          <ToldTech id={r.id} label={r.kind === 'ride_along'
            ? 'I clearly explained to the tech what they can improve on.'
            : 'I reached out to the tech to let them know their work was checked and shared feedback.'} />
        )}
      </div></section>
    </>
  );
}
