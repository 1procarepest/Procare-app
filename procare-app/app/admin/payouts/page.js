import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import PayoutList from './PayoutList';

export const dynamic = 'force-dynamic';

/** Competition prize cash outs for the HR approver (Ally), C-Suite and the President. */
export default async function PayoutsPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: ok } = await supabase.rpc('can_manage_payouts');
  if (!ok) redirect('/admin');
  const [{ data: requests, error }, { data: awards }] = await Promise.all([
    supabase.from('payout_requests')
      .select('id, amount, status, requested_at, paid_at, note, employees!payout_requests_employee_id_fkey(id, first_name, last_name, department, office)')
      .order('requested_at', { ascending: false }).limit(200),
    supabase.from('competition_awards').select('payout_id, reason, amount').not('payout_id', 'is', null),
  ]);
  if (error) return <p className="error">Payouts couldn’t load: {error.message}</p>;
  const items = {};
  (awards || []).forEach((a) => (items[a.payout_id] ||= []).push(a));
  return (
    <>
      <h1>Prize payouts</h1>
      <p className="note">Competition prizes and quarterly bonuses people have cashed out. Pay each one, then mark it paid; the person gets an email.
        Technicians and office staff: enter it in ADP. Sales reps: pay it the way you do today (Everee later).</p>
      <PayoutList requests={(requests || []).map((r) => ({ ...r, person: r.employees, items: items[r.id] || [] }))} meId={me.id} />
    </>
  );
}
