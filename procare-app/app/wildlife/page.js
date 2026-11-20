import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { shortDate } from '@/lib/labels';
import { INCENTIVES, PERIODS } from '@/lib/scorecard';
import ScorecardView from '../scorecard/ScorecardView';
import Critter, { CritterTile } from '../Critter';
import WildlifeSales from './WildlifeSales';

export const dynamic = 'force-dynamic';

const range = (a, b) => (String(a).slice(0, 10) === String(b).slice(0, 10) ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);
// Wildlife pay is its own plan (coming next), so the technician incentives stay off on this board
const NO_INCENTIVES = Object.fromEntries(INCENTIVES.map((k) => [`on_${k}`, false]));
const HEAD = [['raccoon', 'forest'], ['bat', 'ink'], ['squirrel', 'lime'], ['snake', 'ink'], ['opossum', 'sage']];

/** Wildlife (change 63): the Wildlife department's own scorecard and wildlife service sales. */
export default async function WildlifePage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const period = PERIODS.find((p) => p.key === searchParams?.period) || PERIODS.find((p) => p.key === 'thisMonth');

  const [{ data: rows, error }, { data: perRows }, { data: sales }] = await Promise.all([
    supabase.rpc('wildlife_scorecard', { p_period: period.key }),
    supabase.rpc('scorecard_period', { p_period: period.key }),
    supabase.rpc('wildlife_sales', { p_period: period.key }),
  ]);
  if (error) return <p className="error">The Wildlife scorecard couldn’t load: {error.message}</p>;
  const per = (perRows || [])[0] || {};

  const techs = {};
  (rows || []).forEach((r) => {
    const t = techs[r.employee_id] || (techs[r.employee_id] = {
      id: r.employee_id, name: `${r.first_name} ${r.last_name}`.replace(/\s+/g, ' ').trim(), office: r.office, photo: r.photo_url,
    });
    t[r.which] = r;
  });
  const people = Object.values(techs);

  return (
    <>
      <div className="rc-top brand-head brand-hero wl-head">
        <Critter kind="raccoon" size={170} className="brand-head-bug" />
        <div>
          <p className="rc-kicker">Wildlife · Professionals who care</p>
          <h1 className="rc-title">Wildlife <em>Performance Card</em></h1>
          <p className="note">
            {period.label}: {range(per.cur_start, per.cur_end)}{per.in_progress ? ' so far' : ''}. Compared with {period.prior} ({range(per.prior_start, per.prior_end)}).
          </p>
        </div>
        <div className="wl-tiles" aria-hidden="true">
          {HEAD.map(([k, tone]) => <CritterTile key={k} kind={k} tone={tone} size={46} />)}
        </div>
      </div>
      <nav className="tabs tabs-inline sticky-bar" aria-label="Period">
        {PERIODS.map((p) => (
          <Link key={p.key} href={`/wildlife?period=${p.key}`} className={`tab${p.key === period.key ? ' active' : ''}`} aria-current={p.key === period.key ? 'page' : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>

      <WildlifeSales people={people} data={sales} />

      {people.length === 0
        ? <p className="note">Nobody is in the Wildlife department yet.</p>
        : <ScorecardView techs={people} R={NO_INCENTIVES} per={per} period={period} meId={me.id} />}
    </>
  );
}
