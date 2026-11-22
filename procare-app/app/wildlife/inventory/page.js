import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import InventoryView from '../../ops/inventory/InventoryView';

export const dynamic = 'force-dynamic';

/** Wildlife → Inventory (change 84): the wildlife materials kept at West, counted monthly, and their prices. */
export default async function WildlifeInventoryPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me) redirect('/');
  const today = todayYmd();
  const month = /^\d{4}-\d{2}/.test(searchParams?.month || '') && searchParams.month.slice(0, 7) <= today.slice(0, 7) ? `${searchParams.month.slice(0, 7)}-01` : today;
  const { data, error } = await supabase.rpc('inventory_data', { p_month: month });
  if (error) return <p className="error">Inventory couldn’t load: {error.message}{/inventory_data/.test(error.message) ? ' (run change 84 in Supabase first)' : ''}</p>;
  if (!data) redirect('/wildlife');
  // Here it's the wildlife section only, even for people who see everything
  const wl = { ...data, scope: 'wildlife', items: data.items.filter((i) => i.section === 'wildlife'), locations: data.locations.filter((l) => l.has_wildlife),
    counts: data.counts.filter((c) => c.section === 'wildlife'), history: (data.history || []).filter((h) => h.section === 'wildlife'), bwi: null };
  return (
    <InventoryView key={data.month} data={wl} scope="wildlife" canAdmin={false} today={today} startTab={searchParams?.tab}
      canPrice={{ pest: false, wildlife: !!data.can_price_wildlife }} />
  );
}
