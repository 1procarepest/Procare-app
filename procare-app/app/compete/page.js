import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { shortDate } from '@/lib/labels';
import { COMPETE_AS, DEPTS, canCreate, stageOf } from '@/lib/competitions';
import Bug from '../Bug';

export const dynamic = 'force-dynamic';

const STAGES = [
  { key: 'live', title: 'Happening now', bug: 'ant' },
  { key: 'upcoming', title: 'Coming up', bug: 'cricket' },
  { key: 'final', title: 'Finished', bug: 'stinging' },
];
const deptNames = (list) => (list.length === 3 ? 'Company-wide' : list.map((k) => DEPTS.find((d) => d.key === k)?.label || k).join(' + '));

export default async function CompetePage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  const { data, error } = await supabase
    .from('competitions')
    .select('id, name, style, compete_as, team_size, departments, start_date, end_date, prize, competition_members(count)')
    .order('start_date', { ascending: false });
  if (error) return <p className="error">Competitions couldn’t load: {error.message}</p>;
  const list = data || [];

  return (
    <>
      <div className="rc-top">
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
            <div className="rc-block-head"><h2><Bug kind={s.bug} size={22} /> {s.title}</h2></div>
            <div className="cp-list">
              {items.map((c) => (
                <Link key={c.id} href={`/compete/${c.id}`} className={`cp-card cp-${s.key}`}>
                  <span className="cp-card-name">{c.name}</span>
                  <span className="cp-card-meta">{shortDate(c.start_date)} – {shortDate(c.end_date)} · {c.style === 'bracket' ? (c.team_size > 1 ? `Bracket, teams of ${c.team_size}` : 'Bracket') : COMPETE_AS[c.compete_as]} · {deptNames(c.departments)}</span>
                  <span className="cp-card-meta">{c.competition_members?.[0]?.count ?? 0} people</span>
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
