import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { loadInventory } from '@/lib/inventoryPage';
import InventoryView from './InventoryView';

export const dynamic = 'force-dynamic';

/** Operations → Inventory (change 84): the monthly count, the dashboard, items & prices and the BWI Expo. Managers and up, and each place's inventory manager. */
export default async function InventoryPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.department === 'wildlife') redirect('/ops');
  const today = todayYmd();
  const { data, error, people } = await loadInventory(supabase, searchParams, today);
  if (error) return <p className="error">Inventory couldn’t load: {error.message}{/inventory_data/.test(error.message) ? ' (run change 84 in Supabase first)' : ''}</p>;
  if (!data) redirect('/ops');
  return (
    <InventoryView key={data.month} data={data} scope={data.scope} canAdmin={!!data.can_admin} people={people} today={today} startTab={searchParams?.tab}
      canPrice={{ pest: !!data.can_price_pest, wildlife: !!data.can_price_wildlife }} />
  );
}
