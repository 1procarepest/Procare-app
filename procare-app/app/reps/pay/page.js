import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextMonday } from '@/lib/comp';
import { evereeConfigured, evereeEnv, evereeWorkers } from '@/lib/everee';
import { payablePreview } from '@/lib/evereePreview';
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

  // Everee preview (managers of pay only): reads Everee's worker list; sends nothing
  let everee = null;
  if (tab === 'everee') {
    const next = nextMonday(today);
    const payday = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.payday || '') ? searchParams.payday : next;
    everee = { payday, next, configured: evereeConfigured(), env: evereeEnv() };
    if (everee.configured) {
      try {
        const admin = createAdminClient();
        const ids = (data.reps || []).map((r) => r.id);
        const [workers, emps] = await Promise.all([
          evereeWorkers(),
          admin ? admin.from('employees').select('id, first_name, last_name, email').in('id', ids).then((r) => r.data || []) : [],
        ]);
        const payYear = Number(payday.slice(0, 4));
        const src = payYear === year ? data : (await supabase.rpc('comp_sales', { p_year: payYear })).data || data;
        everee = { ...everee, ...payablePreview({ data: src, year: payYear, payday, today, workers, emps }), workerCount: workers.length };
      } catch (e) {
        everee.error = e.message;
      }
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
