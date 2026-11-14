import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { shortDate } from '@/lib/labels';
import { PERIODS } from '@/lib/scorecard';
import ScorecardView from './ScorecardView';

export const dynamic = 'force-dynamic';

const range = (a, b) => (String(a).slice(0, 10) === String(b).slice(0, 10) ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);

export default async function ScorecardPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const period = PERIODS.find((p) => p.key === searchParams?.period) || PERIODS.find((p) => p.key === 'thisMonth');

  const [{ data: rows, error }, { data: perRows }, { data: ruleRow }] = await Promise.all([
    supabase.rpc('tech_scorecard', { p_period: period.key }),
    supabase.rpc('scorecard_period', { p_period: period.key }),
    supabase.from('scorecard_rules').select('rules').eq('id', 1).maybeSingle(),
  ]);
  if (error) return <p className="error">The scorecard couldn’t load: {error.message}</p>;
  const per = (perRows || [])[0] || {};

  // One entry per tech: { id, name, office, photo, cur, prior }
  const techs = {};
  (rows || []).forEach((r) => {
    const t = techs[r.employee_id] || (techs[r.employee_id] = {
      id: r.employee_id, name: `${r.first_name} ${r.last_name}`.replace(/\s+/g, ' ').trim(), office: r.office, photo: r.photo_url,
    });
    t[r.which] = r;
  });

  return (
    <>
      <div className="admin-head bug-band">
        <h1 className="sc-title">Technician scorecard</h1>
        <p className="note">
          {period.label}: {range(per.cur_start, per.cur_end)}{per.in_progress ? ' so far' : ''}. Compared with {period.prior} ({range(per.prior_start, per.prior_end)}).
        </p>
      </div>
      <nav className="tabs tabs-inline" aria-label="Period">
        {PERIODS.map((p) => (
          <Link key={p.key} href={`/scorecard?period=${p.key}`} className={`tab${p.key === period.key ? ' active' : ''}`} aria-current={p.key === period.key ? 'page' : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
      <ScorecardView techs={Object.values(techs)} R={ruleRow?.rules || {}} per={per} period={period} meId={me.id} />
    </>
  );
}
