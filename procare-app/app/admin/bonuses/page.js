import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { autoStart, officeNumbers, quarterName, quarterOf, quarterRange } from '@/lib/bonus';
import { loadQuarter } from '@/lib/bonusData';
import BonusAdmin from './BonusAdmin';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'goals', label: 'Goals' },
  { key: 'amounts', label: 'Yearly bonuses' },
  { key: 'approve', label: 'Approve' },
  { key: 'settings', label: 'Settings' },
];

/** Settings → Bonuses: for the HR approver (Ally), C-Suite and the President. */
export default async function BonusesPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: ok } = await supabase.rpc('can_manage_bonuses');
  if (!ok) redirect('/admin');
  const today = todayYmd();
  const m = /^(\d{4})-([1-4])$/.exec(searchParams?.q || '');
  const at = m ? { year: Number(m[1]), quarter: Number(m[2]) } : quarterOf(today);
  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams.tab : 'goals';
  const step = (n) => { const i = at.year * 4 + at.quarter - 1 + n; return `${Math.floor(i / 4)}-${(i % 4) + 1}`; };

  const [data, { data: people }, { data: plans }, { data: pending }, { data: techs }] = await Promise.all([
    loadQuarter(supabase, at.year, at.quarter, today),
    supabase.from('employees').select('id, first_name, last_name, office, department, level').eq('active', true).order('first_name').order('last_name'),
    supabase.from('bonus_plans').select('employee_id, year, amount').eq('year', at.year),
    supabase.from('bonus_entries')
      .select('id, day, qty, link, note, created_at, employees(first_name, last_name), bonus_goals(label, kind, bonus_sets(name, year, quarter))')
      .eq('status', 'pending').order('created_at'),
    supabase.from('employees').select('office').eq('active', true).eq('department', 'technician').eq('level', 'team_member'),
  ]);
  if (data.error) return <p className="error">Bonuses couldn’t load: {data.error.message}</p>;

  // Starting numbers the app would record, per office (and company-wide), for the goal editor's hints
  const p = at.quarter === 1 ? { year: at.year - 1, quarter: 4 } : { year: at.year, quarter: at.quarter - 1 };
  const pr = quarterRange(p.year, p.quarter);
  const { data: prevNums } = await supabase.rpc('bonus_numbers', { p_from: pr.from, p_to: pr.to });
  const starts = {};
  [null, 'east', 'west', 'south'].forEach((office) => {
    const o = officeNumbers(data.nums, office);
    const prev = prevNums ? officeNumbers(prevNums, office) : null;
    starts[office || 'all'] = Object.fromEntries(['autopay', 'ar_past', 'pool', 'cancel'].map((k) => [k, autoStart(k, o, prev)]));
  });
  const techCount = { all: (techs || []).length };
  (techs || []).forEach((t) => { techCount[t.office || ''] = (techCount[t.office || ''] || 0) + 1; });

  return (
    <>
      <div className="admin-head">
        <h1>Quarterly bonuses</h1>
        <p className="note">Yearly bonuses are paid a quarter at a time on the goals set here. Approved bonuses land in each person’s Earnings to cash out, then show under Prize payouts.</p>
      </div>
      <div className="bn-admin-bar">
        <nav className="tabs tabs-inline" aria-label="Bonuses">
          {TABS.map((t) => (
            <Link key={t.key} href={`/admin/bonuses?tab=${t.key}&q=${at.year}-${at.quarter}`} className={`tab${t.key === tab ? ' active' : ''}`}>
              {t.label}{t.key === 'approve' && (pending || []).length ? ` (${pending.length})` : ''}
            </Link>
          ))}
        </nav>
        <nav className="rc-step" aria-label="Choose a quarter">
          <Link className="rc-arrow" href={`/admin/bonuses?tab=${tab}&q=${step(-1)}`} aria-label="Previous quarter">‹</Link>
          <span className="rc-range">{tab === 'amounts' ? at.year : quarterName(at.year, at.quarter)}</span>
          <Link className="rc-arrow" href={`/admin/bonuses?tab=${tab}&q=${step(1)}`} aria-label="Next quarter">›</Link>
        </nav>
      </div>
      <BonusAdmin
        tab={tab} me={me} today={today} year={at.year} quarter={at.quarter} range={quarterRange(at.year, at.quarter)}
        sets={data.sets} settings={data.settings} sources={[...(data.nums?.sources || []), ...(prevNums?.sources || [])]}
        people={people || []} plans={plans || []} pending={pending || []} starts={starts} techCount={techCount}
      />
    </>
  );
}
