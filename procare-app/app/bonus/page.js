import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { shortDate } from '@/lib/labels';
import { money2, quarterName, quarterOf, takesEntries, whereName } from '@/lib/bonus';
import { loadQuarter } from '@/lib/bonusData';
import Bug from '../Bug';
import GoalCard from './GoalCard';
import LogEntry from './LogEntry';

export const dynamic = 'force-dynamic';

/** "?q=2027-1" → { year, quarter }, else this quarter. */
function askedQuarter(q, today) {
  const m = /^(\d{4})-([1-4])$/.exec(q || '');
  return m ? { year: Number(m[1]), quarter: Number(m[2]) } : quarterOf(today);
}
const step = ({ year, quarter }, n) => {
  const i = year * 4 + quarter - 1 + n;
  return { year: Math.floor(i / 4), quarter: (i % 4) + 1 };
};

export default async function BonusPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  const at = askedQuarter(searchParams?.q, today);
  const { sets, error, from, to } = await loadQuarter(supabase, at.year, at.quarter, today);
  const { data: links } = await supabase.rpc('my_bonus_links');
  if (error) return <p className="error">Bonuses couldn’t load: {error.message}</p>;
  if (links?.manage) {
    const { count } = await supabase.from('bonus_members').select('set_id', { count: 'exact', head: true }).eq('employee_id', me.id);
    if (!count) redirect('/admin/bonuses');   // runs bonuses but has no goals of their own
  }
  const mine = sets.filter((s) => s.members.some((m) => m.employee_id === me.id));
  const prev = step(at, -1);
  const next = step(at, 1);
  const qHref = (x) => `/bonus?q=${x.year}-${x.quarter}`;

  return (
    <>
      <div className="rc-top brand-head brand-hero">
        <Bug kind="termite" size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker">Quarterly bonus · Extreme ownership</p>
          <h1 className="rc-title">Your <em>goals</em></h1>
          <p className="note">{shortDate(from)} to {shortDate(to)}</p>
        </div>
        <nav className="rc-step" aria-label="Choose a quarter">
          <Link className="rc-arrow" href={qHref(prev)} aria-label="Previous quarter">‹</Link>
          <span className="rc-range">{quarterName(at.year, at.quarter)}</span>
          <Link className="rc-arrow" href={qHref(next)} aria-label="Next quarter">›</Link>
        </nav>
      </div>

      {links?.manage && <p className="cp-me">You run bonuses. Set goals and approve proof in <Link href="/admin/bonuses">Settings → Bonuses</Link>.</p>}

      {mine.length === 0 && (
        <div className="rc-panel"><div className="rc-panel-body cp-empty">
          <Bug kind="ant" size={40} />
          <p>No bonus goals for you in {quarterName(at.year, at.quarter)} yet. Ally sets them at the start of each quarter.</p>
        </div></div>
      )}

      {mine.map((s) => {
        const meRow = s.score.people.find((p) => p.id === me.id) || { quarter: 0, earned: 0, projected: 0 };
        const final = !!s.score.final;
        const others = s.members.filter((m) => m.employee_id !== me.id);
        return (
          <section key={s.id} className="rc-panel"><div className="rc-panel-body rf-sec">
            <div className="rf-head">
              <h2>{s.name}</h2>
              <span className="note">{whereName(s.office)}{others.length ? ` · shared with ${others.map((m) => m.first_name).join(', ')}` : ''}</span>
            </div>
            <div className="bn-hero">
              <span><small>{final ? 'Final bonus' : 'Earning so far'}</small><b>{money2(meRow.earned)}</b></span>
              {!final && <span><small>At this pace</small><b>{money2(meRow.projected)}</b></span>}
              <span><small>Quarter bonus</small><b>{money2(meRow.quarter)}</b></span>
            </div>
            {final && <p className="ok">Approved {shortDate(String(s.approved_at).slice(0, 10))}. It’s in your Earnings on your profile to cash out.</p>}
            {!final && s.score.through && <p className="note">Numbers through {shortDate(s.score.through)}, {Math.round(s.score.share * 100)}% of the way through the quarter. Nothing is paid until the quarter closes and the final numbers are approved.</p>}
            <ul className="bn-goals">
              {s.score.goals.map((g) => (
                <GoalCard key={g.id} g={g} quarter={meRow.quarter} final={final}>
                  {takesEntries(g.kind) && (
                    <LogEntry goal={g} entries={s.entries.filter((e) => e.goal_id === g.id)} meId={me.id} today={today} open={!s.approved_at && today >= from} />
                  )}
                </GoalCard>
              ))}
            </ul>
          </div></section>
        );
      })}
    </>
  );
}
