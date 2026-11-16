import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { OFFICES, OFFICE_NAME, shortDate } from '@/lib/labels';
import { KIND_LABEL, SKILLS } from '@/lib/reports';
import { quarterName, quarterOf, quarterRange } from '@/lib/bonus';
import Bug, { BugTile } from '../Bug';
import Outbox from './Outbox';
import TruckList from './TruckList';
import PastReport from './PastReport';

export const dynamic = 'force-dynamic';

const PER_TECH = { ride_along: 2, follow_behind: 2 };

export default async function ReportsPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  const { year, quarter } = quarterOf(today);
  const { from, to } = quarterRange(year, quarter);
  const office = OFFICES.some((o) => o.key === searchParams?.office) ? searchParams.office : (me.office || 'east');

  const [{ data: canFile }, { data: tally }, { data: techs }, { data: recent }, { data: truck }, { data: links }, { data: staff }] = await Promise.all([
    supabase.rpc('can_file_reports'),
    supabase.rpc('report_tally', { p_from: from, p_to: to }),
    supabase.from('employees').select('id, first_name, last_name, office').eq('active', true)
      .eq('department', 'technician').eq('level', 'team_member').order('first_name'),
    supabase.from('field_reports')
      .select('id, kind, day, customer, told_tech, office, answers, tech:employees!field_reports_tech_id_fkey(first_name, last_name), author:employees!field_reports_author_id_fkey(first_name, last_name)')
      .order('day', { ascending: false }).order('created_at', { ascending: false }).limit(60),
    supabase.from('truck_issues').select('id, item, created_at, office, tech:employees!truck_issues_tech_id_fkey(first_name, last_name)')
      .eq('status', 'open').order('created_at'),
    supabase.rpc('my_bonus_links'),
    supabase.from('employees').select('id, first_name, last_name, office, department, level').eq('active', true)
      .in('level', ['team_member', 'lead', 'manager', 'c_suite', 'president']).order('first_name'),
  ]);
  const people = staff || [];
  const pastTechs = people.filter((p) => p.department === 'technician' && ['team_member', 'lead'].includes(p.level));
  const leaders = people.filter((p) => ['lead', 'manager', 'c_suite', 'president'].includes(p.level));
  const earliest = [from, new Date(Date.parse(`${today}T12:00:00Z`) - 60 * 864e5).toISOString().slice(0, 10)].sort()[0];

  // This office, this quarter: who still needs a ride-along or follow-behind (only reports where the tech was told count)
  const counted = (tally || []).filter((r) => r.told_tech && r.office === office);
  const share = Math.min(1, (new Date(`${today}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 864e5 / ((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 864e5 + 1));
  const roster = (techs || []).filter((t) => t.office === office).map((t) => {
    const mine = counted.filter((r) => r.tech_id === t.id);
    const ra = mine.filter((r) => r.kind === 'ride_along').length;
    const fb = mine.filter((r) => r.kind === 'follow_behind').length;
    return { ...t, ra, fb, left: Math.max(0, PER_TECH.ride_along - ra) + Math.max(0, PER_TECH.follow_behind - fb) };
  }).sort((x, y) => y.left - x.left || x.first_name.localeCompare(y.first_name));
  const goal = roster.length * (PER_TECH.ride_along + PER_TECH.follow_behind);
  const done = roster.reduce((t, r) => t + Math.min(PER_TECH.ride_along, r.ra) + Math.min(PER_TECH.follow_behind, r.fb), 0);
  const expected = Math.round(goal * share);

  // Training patterns: the Where to improve switches across this office's ride-alongs this quarter
  const rides = (tally || []).filter((r) => r.kind === 'ride_along' && r.office === office);
  const patterns = SKILLS.map((s) => ({ ...s, n: rides.filter((r) => (r.improve || []).includes(s.key)).length }))
    .filter((s) => s.n > 0).sort((x, y) => y.n - x.n);
  const officeTruck = (truck || []).filter((t) => t.office === office)
    .map((t) => ({ ...t, who: t.tech ? `${t.tech.first_name} ${t.tech.last_name}` : '' }));

  return (
    <>
      <div className="rc-top brand-head brand-hero">
        <Bug kind="spider" size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker">Professionals who care · {quarterName(year, quarter)}</p>
          <h1 className="rc-title">Ride-alongs and <em>follow-behinds</em></h1>
        </div>
        {canFile && (
          <div className="rf-new">
            <Link className="btn btn-small" href="/reports/new?kind=ride_along">New ride-along</Link>
            <Link className="btn btn-small" href="/reports/new?kind=follow_behind">New follow-behind</Link>
          </div>
        )}
      </div>

      {searchParams?.sent && <p className="cp-me">Sent. Ryan has a copy, and it counts once the “I told the tech” switch is on.</p>}
      {searchParams?.queued && <p className="cp-me">No signal right now. The report is saved on this phone and sends when you’re back online.</p>}
      <Outbox />
      {(canFile || links?.manage) && (
        <div className="rf-past-wrap">
          <PastReport techs={pastTechs} leaders={leaders} meId={me.id} canManage={!!links?.manage} today={today} earliest={earliest} />
        </div>
      )}

      <nav className="rc-seg rf-offices" aria-label="Office">
        {OFFICES.map((o) => <Link key={o.key} href={`/reports?office=${o.key}`} className={o.key === office ? 'on' : ''}>{o.name.replace('Atlanta ', '')}</Link>)}
      </nav>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <div className="rf-head">
          <h2><BugTile kind="ant" tone="lime" size={30} /> {OFFICE_NAME[office]} this quarter</h2>
          <span className={`pill ${done >= expected ? 'pill-good' : 'pill-bad'}`}>{done} of {goal} done · {done >= expected ? 'on pace' : `${expected - done} behind pace`}</span>
        </div>
        <p className="note">Each tech needs 2 ride-alongs and 2 follow-behinds a quarter. Only reports where the tech was told count.</p>
        {roster.length === 0 ? <p className="note">No technicians in this office.</p> : (
          <ul className="rf-roster">
            {roster.map((t) => (
              <li key={t.id} className={t.left === 0 ? 'rf-done' : ''}>
                <span>{t.first_name} {t.last_name}</span>
                <span className={t.ra >= 2 ? 'rf-ok' : ''}>Ride-alongs {t.ra}/2</span>
                <span className={t.fb >= 2 ? 'rf-ok' : ''}>Follow-behinds {t.fb}/2</span>
              </li>
            ))}
          </ul>
        )}
      </div></section>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2><BugTile kind="tick" tone="forest" size={30} /> Open truck items</h2>
        {officeTruck.length ? <TruckList items={officeTruck} /> : <p className="note">Nothing open. 🎉</p>}
      </div></section>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2><BugTile kind="cricket" tone="sage" size={30} /> Training patterns</h2>
        {patterns.length ? (
          <>
            <p className="note">What managers flagged in {OFFICE_NAME[office]}’s {rides.length} ride-along{rides.length === 1 ? '' : 's'} this quarter. Cover the top ones at the next team meeting.</p>
            <ul className="rf-patterns">
              {patterns.map((p) => (
                <li key={p.key}>
                  <span>{p.label}</span>
                  <span className="rf-bar"><span style={{ width: `${Math.round((100 * p.n) / rides.length)}%` }} /></span>
                  <b>{p.n} of {rides.length}</b>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="note">Nothing flagged yet this quarter.</p>}
      </div></section>

      <section className="rc-panel"><div className="rc-panel-body rf-sec">
        <h2>Recent reports</h2>
        {(recent || []).length === 0 ? <p className="note">No reports yet.</p> : (
          <ul className="rf-list">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`}>
                  <b>{KIND_LABEL[r.kind]}: {r.tech?.first_name} {r.tech?.last_name}</b>
                  <small>{shortDate(r.day)} · by {r.author?.first_name} {r.author?.last_name}{r.customer ? ` · ${r.customer}` : ''}{r.office ? ` · ${OFFICE_NAME[r.office]}` : ''}</small>
                </Link>
                {r.answers?.past && <span className="pill">Logged after the fact</span>}
                {!r.told_tech && <span className="pill pill-bad">Tech not told yet</span>}
              </li>
            ))}
          </ul>
        )}
      </div></section>
    </>
  );
}
