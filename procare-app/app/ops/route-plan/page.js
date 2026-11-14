import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { OFFICES } from '@/lib/labels';
import { todayYmd } from '@/lib/repcards';
import { planRange } from '@/lib/routeplan';
import RoutePlanView from './RoutePlanView';

export const dynamic = 'force-dynamic';

export default async function RoutePlanPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  const { from, to } = planRange(searchParams?.from, searchParams?.to, today);
  const keys = OFFICES.map((o) => o.key);
  const office = keys.includes(searchParams?.office) ? searchParams.office : keys.includes(me?.office) ? me.office : 'east';

  const { data, error } = await supabase.rpc('route_plan_data', { p_from: from, p_to: to });
  if (error) return <p className="error">The route plan couldn’t load: {error.message}</p>;

  return <RoutePlanView data={data} office={office} from={from} to={to} today={today} meId={me?.id || null} />;
}
