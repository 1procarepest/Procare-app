import { createClient } from '@/lib/supabase/server';
import { todayYmd } from '@/lib/repcards';
import { payPeriod } from '@/lib/payroll';
import { buildAssists, buildReferrals, buildWildlifePay } from '@/lib/wildlifePay';
import WildlifePayView from './WildlifePayView';

export const dynamic = 'force-dynamic';

/** Wildlife → Pay (change 65): per pay period (1st–15th, 16th–end), earned when a job's first visit is done. */
export default async function WildlifePayPage({ searchParams }) {
  const supabase = createClient();
  const today = todayYmd();
  const period = payPeriod(/^\d{4}-\d{2}-\d{2}$/.test(searchParams?.from || '') ? searchParams.from : today);
  const { data, error } = await supabase.rpc('wildlife_pay_data', { p_from: period.from, p_to: period.to });
  if (error) return <p className="error">Wildlife pay couldn’t load: {error.message}</p>;
  if (!data) return <p className="note">Wildlife pay is for the Wildlife team, the HR approver and C-Suite.</p>;
  return (
    <WildlifePayView
      people={buildWildlifePay(data)}
      referrals={buildReferrals(data)}
      assists={buildAssists(data)}
      jobs={data.jobs || []}
      names={data.people || {}}
      canToggle={!!data.can_toggle}
      period={period}
      today={today}
      canEdit={!!data.can_edit}
      everyone={!!data.everyone}
    />
  );
}
