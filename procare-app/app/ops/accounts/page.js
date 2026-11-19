import { createClient } from '@/lib/supabase/server';
import { buildSnapshot } from '@/lib/ops';
import OpsView from '../OpsView';

export const dynamic = 'force-dynamic';

/** AR & job pool: balances and unscheduled services right now (split from the Operations Suite). */
export default async function AccountsPage() {
  const supabase = createClient();
  const [{ data: snap, error }, { data: synced }] = await Promise.all([
    supabase.rpc('ops_snapshot'),
    supabase.rpc('fr_last_sync'),
  ]);
  if (error) return <p className="error">AR &amp; job pool couldn’t load: {error.message}</p>;
  return <OpsView mode="accounts" snap={buildSnapshot(snap)} syncedAt={synced || null} />;
}
