import { createClient } from '@/lib/supabase/server';
import { todayYmd } from '@/lib/repcards';
import { buildDebt } from '@/lib/debt';
import DebtView from './DebtView';

export const dynamic = 'force-dynamic';

/** Finance → Debt (change 76): every loan, card and line, balances from the QuickBooks balance sheet, against net profit. */
export default async function DebtPage() {
  const supabase = createClient();
  const today = todayYmd();
  const { data, error } = await supabase.rpc('debt_data');
  if (error) return <p className="error">The debt schedule couldn’t load: {error.message}{/debt_data/.test(error.message) ? ' (run change 76 in Supabase first)' : ''}</p>;
  if (!data) return <p className="error">Only C-Suite and the President can see the debt schedule.</p>;
  return <DebtView d={buildDebt(data, today)} connection={data.connection || {}} today={today} />;
}
