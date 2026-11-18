import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import RulesEditor from './RulesEditor';
import { prevQuarter, quarterOf, quarterRange } from '@/lib/bonus';
import { todayYmd } from '@/lib/repcards';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (me.rank < 4) redirect('/scorecard');
  // Every FieldRoutes cancel reason used this quarter and last, with counts, for the reason switches.
  const q = quarterOf(todayYmd());
  const pq = prevQuarter(q.year, q.quarter);
  const from = quarterRange(pq.year, pq.quarter).from;
  const { data: nums } = await supabase.rpc('bonus_numbers', { p_from: from, p_to: quarterRange(q.year, q.quarter).to });
  const reasons = (nums?.cancel_reasons || []).map((r) => ({ reason: r.reason, n: Number(r.n || 0) }));
  const { data } = await supabase
    .from('scorecard_rules')
    .select('rules, updated_at, editor:employees!scorecard_rules_updated_by_fkey(first_name, last_name)')
    .eq('id', 1)
    .maybeSingle();

  return (
    <>
      <div className="admin-head">
        <h1>Technician incentives</h1>
        <p className="note">
          Switch each incentive on or off and set what it pays. Only C-Suite and the President can change these.
          Amounts are per month. Weeks and part-months are prorated, except the per-review and per-sale amounts.
          {data?.editor ? ` Last changed by ${data.editor.first_name} ${data.editor.last_name}, ${new Date(data.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}.` : ''}
        </p>
      </div>
      <RulesEditor initial={data?.rules || {}} myId={me.id} reasons={reasons} />
    </>
  );
}
