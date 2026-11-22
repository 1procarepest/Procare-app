import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { appsOf } from '@/lib/apps';
import { todayYmd } from '@/lib/repcards';
import { loadInventory } from '@/lib/inventoryPage';
import TopNav from '../TopNav';
import InventoryView from '../ops/inventory/InventoryView';

export const dynamic = 'force-dynamic';

/** Inventory for a place's inventory manager who isn't in Operations (change 86). Everyone else uses Operations → Inventory. */
export default async function StandaloneInventory({ searchParams }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');
  if (!me) redirect('/');
  if (me.department === 'wildlife') redirect('/wildlife/inventory');
  if (appsOf(me).includes('operations')) redirect('/ops/inventory');
  const today = todayYmd();
  const { data, error, people } = await loadInventory(supabase, searchParams, today);
  if (error) return <p className="error">Inventory couldn’t load: {error.message}</p>;
  if (!data) redirect('/');
  return (
    <>
      <TopNav me={me} supabase={supabase} current="inventory" />
      <main className="admin scorecard reps ops">
        <InventoryView key={data.month} data={data} scope={data.scope} canAdmin={!!data.can_admin} people={people} today={today} startTab={searchParams?.tab}
          canPrice={{ pest: !!data.can_price_pest, wildlife: !!data.can_price_wildlife }} />
      </main>
    </>
  );
}
