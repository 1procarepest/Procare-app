import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { buildInventory } from '@/lib/inventory';
import InventoryView from './InventoryView';

export const dynamic = 'force-dynamic';

/** Operations → Inventory (change 84): the monthly count, the dashboard, items & prices and the BWI Expo. Managers and up. */
export default async function InventoryPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 3 || me.department === 'wildlife') redirect('/ops');
  const today = todayYmd();
  const month = /^\d{4}-\d{2}/.test(searchParams?.month || '') && searchParams.month.slice(0, 7) <= today.slice(0, 7) ? `${searchParams.month.slice(0, 7)}-01` : today;
  const { data, error } = await supabase.rpc('inventory_data', { p_month: month });
  if (error) return <p className="error">Inventory couldn’t load: {error.message}{/inventory_data/.test(error.message) ? ' (run change 84 in Supabase first)' : ''}</p>;
  if (!data) redirect('/ops');
  return (
    <InventoryView key={data.month} inv={buildInventory(data)} scope={data.scope} canAdmin={!!data.can_admin} today={today} startTab={searchParams?.tab}
      canPrice={{ pest: !!data.can_price_pest, wildlife: !!data.can_price_wildlife }} />
  );
}
