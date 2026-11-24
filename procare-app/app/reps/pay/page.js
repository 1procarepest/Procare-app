import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { nextMonday } from '@/lib/comp';
import { loadEveree } from '@/lib/evereeLoad';
import PayView from './PayView';

export const dynamic = 'force-dynamic';

const TABS = ['statement', 'calc', 'plans', 'everee'];

export default async function PayPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  // Sales → Pay (moved from the top-bar Pay link 2026-11-19): everyone in sales sees their own;
  // sales managers, C-Suite and the President (can_manage_pay) see everyone.
  const { data: boss } = await supabase.rpc('can_manage_pay');
  if (me.department !== 'sales' && !boss) redirect('/reps');
  const today = todayYmd();
  const thisYear = Number(today.slice(0, 4));
  const askedYear = parseInt(searchParams?.year, 10);
  const year = askedYear >= 2025 && askedYear <= thisYear + 1 ? askedYear : thisYear;
  let tab = TABS.includes(searchParams?.tab) ? searchParams.tab : 'statement';

  const { data, error } = await supabase.rpc('comp_sales', { p_year: year });
  if (error || !data) return <p className="error">Pay couldn’t load: {error?.message || 'no data'}</p>;
  if ((tab === 'plans' || tab === 'everee') && !data.boss) tab = 'statement';

  // Everee (managers of pay only): reads Everee's worker list and what was sent; sending is /api/everee/send
  let everee = null;
  if (tab === 'everee') {
    const next = nextMonday(today);
    const payday = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.payday || '') ? searchParams.payday : next;
    try {
      everee = { ...(await loadEveree(supabase, { payday, today, data: { ...data, year } })), next };
    } catch (e) {
      everee = { payday, next, configured: true, error: e.message, sent: {} };
    }
  }

  // Plans for next year too, so they can be set up in December
  let nextPlans = [];
  if (tab === 'plans') {
    const { data: rows } = await supabase.from('comp_assignments').select('*').eq('year', year + 1);
    nextPlans = rows || [];
  }

  const rep = data.boss ? (data.reps.some((r) => r.id === searchParams?.rep) ? searchParams.rep : null) : me.id;

  return <PayView data={data} year={year} thisYear={thisYear} today={today} tab={tab} rep={rep} meId={me.id} nextPlans={nextPlans} everee={everee} />;
}
