import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { buildPayroll, payPeriod } from '@/lib/payroll';
import PayrollView from './PayrollView';

export const dynamic = 'force-dynamic';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Payroll (change 60): who was out, paid vacation vs unpaid, for a pay period (the default: the current one)
 * or a whole year. For the HR approver, the President and C-Suite.
 */
export default async function PayrollPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!(me.rank >= 4 || me.hr_approver)) redirect('/admin');
  const today = todayYmd();
  const yearView = searchParams?.view === 'year';
  const year = /^\d{4}$/.test(searchParams?.year || '') ? Number(searchParams.year) : Number(today.slice(0, 4));
  const period = yearView
    ? { from: `${year}-01-01`, to: `${year}-12-31` }
    : payPeriod(YMD.test(searchParams?.from || '') ? searchParams.from : today);

  const { data, error } = await supabase.rpc('payroll_data', { p_from: period.from, p_to: period.to });
  if (error) return <p className="error">Payroll couldn’t load: {error.message}</p>;
  return (
    <PayrollView
      rows={buildPayroll(data, period.from, period.to)}
      staff={data?.staff || []}
      period={period}
      yearView={yearView}
      year={year}
      today={today}
    />
  );
}
