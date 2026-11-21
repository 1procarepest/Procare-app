import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { buildMaintenance } from '@/lib/maintenance';
import MaintenanceView from './MaintenanceView';

export const dynamic = 'force-dynamic';

/** Operations → Maintenance (change 82): oil changes due and the last 12 months of maintenance. Managers and up. */
export default async function MaintenancePage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 3 || me.department === 'wildlife') redirect('/ops');
  const today = todayYmd();
  const from = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const { data, error } = await supabase.rpc('maintenance_data', { p_from: from, p_to: today });
  if (error) return <p className="error">Maintenance couldn’t load: {error.message}{/maintenance_data/.test(error.message) ? ' (run change 82 in Supabase first)' : ''}</p>;
  if (!data) redirect('/ops');
  return <MaintenanceView m={buildMaintenance(data, today)} canSetRules={!!data.can_set_rules} today={today} />;
}
