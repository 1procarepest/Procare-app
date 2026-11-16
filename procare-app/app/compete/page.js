import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { shortDate } from '@/lib/labels';
import { COMPETE_AS, DEPTS, canCreate, prizeLine, stageOf } from '@/lib/competitions';
import Bug, { BugTile } from '../Bug';
import { settleCompetitions } from '@/lib/awards';

export const dynamic = 'force-dynamic';

const STAGES = [
  { key: 'live', title: 'Happening now', bug: 'ant', tag: 'Live', tone: 'lime' },
  { key: 'upcoming', title: 'Coming up', bug: 'cricket', tag: 'Coming up', tone: 'forest' },
  { key: 'final', title: 'Finished', bug: 'stinging', tag: 'Final', tone: 'sage' },
];
const deptNames = (list) => (list.length === 3 ? 'Company-wide' : list.map((k) => DEPTS.find((d) => d.key === k)?.label || k).join(' + '));

export default async function CompetePage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  await settleCompetitions(supabase, today);
  const [{ data, error }, { data: mine }] = await Promise.all([
    supabase.from('competitions')
      .select('id, name, style, compete_as, team_size, departments, start_date, end_date, prize, payouts, created_by, creator:employees!competitions_created_by_fkey(first_name, last_name), competition_members(count)')
      .order('start_date', { ascending: false }),
    supabase.from('competition_members').select('competition_id').eq('employee_id', me.id),
  ]);
  if (error) return <p className="error">Competitions couldn’t load: {error.message}</p>;
  // Everyone sees their own department's competitions, plus any they're in or created.
  // C-Suite and the President see them all.
  const inIds = new Set((mine || []).map((m) => m.competition_id));
  const list = (data || []).filter((c) => me.rank >= 4 || c.departments.includes(me.department) || inIds.has(c.id) || c.created_by === me.id);

  return (
    <>
      <div className="rc-top brand-head">
        <Bug kind="stinging" size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker">Competitions</p>
          <h1 className="rc-title">Who’s <em>winning</em></h1>
        </div>
        {canCreate(me) && <Link className="btn btn-small" href="/compete/new">New competition</Link>}
      </div>

      {list.length === 0 && (
        <div className="rc-panel"><div className="rc-panel-body cp-empty">
          <Bug kind="ant" size={40} />
          <p>No competitions yet.{canCreate(me) ? ' Click “New competition” to start one.' : ' Check back soon.'}</p>
        </div></div>
      )}

      {STAGES.map((s) => {
        const items = list.filter((c) => stageOf(c, today) === s.key);
        if (!items.length) return null;
        return (
          <section key={s.key} className="rc-block">
            <div className="rc-block-head"><h2><BugTile kind={s.bug} tone={s.tone} size={30} /> {s.title}</h2></div>
            <div className="cp-list">
              {items.map((c, i) => (
                <Link key={c.id} href={`/compete/${c.id}`} className={`cp-card cp-${s.key}`}>
                  <Bug kind={['ant', 'spider', 'roach', 'termite', 'cricket', 'tick'][i % 6]} size={110} className="cp-card-bug" />
                  <span className="cp-tag">{s.tag}{c.style === 'bracket' ? ' · Bracket' : c.style === 'kpi' ? ' · Office KPIs' : ''}</span>
                  <span className="cp-card-name">{c.name}</span>
                  <span className="cp-card-meta">{shortDate(c.start_date)} – {shortDate(c.end_date)} · {c.style === 'kpi' ? 'Office KPIs' : c.style === 'bracket' ? (c.team_size > 1 ? `Bracket, teams of ${c.team_size}` : 'Bracket') : COMPETE_AS[c.compete_as]} · {deptNames(c.departments)}</span>
                  <span className="cp-card-meta">{c.competition_members?.[0]?.count ?? 0} people{c.creator ? ` · Created by ${c.creator.first_name} ${c.creator.last_name}`.trimEnd() : ''}</span>
                  {prizeLine(c) && <span className="cp-prize">💵 {prizeLine(c)}</span>}
                  {c.prize && <span className="cp-prize">🏆 {c.prize}</span>}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
