import { createClient } from '@/lib/supabase/server';
import { VIEWS, todayYmd } from '@/lib/repcards';
import { buildOps, opsRange } from '@/lib/ops';
import OpsView from './OpsView';

export const dynamic = 'force-dynamic';

export default async function OpsPage({ searchParams }) {
  const supabase = createClient();
  const today = todayYmd();
  const view = VIEWS.some((v) => v.key === searchParams?.view) ? searchParams.view : 'day';
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.date || '') ? searchParams.date : today;
  const r = opsRange(view, asked, today);

  // Job pool and AR moved to their own tab (/ops/accounts), so this page runs one big calculation, not two
  const [{ data: suite, error }, { data: synced }] = await Promise.all([
    supabase.rpc('ops_suite', { p_from: r.from, p_to: r.to, p_cfrom: r.cFrom, p_cto: r.cTo }),
    supabase.rpc('fr_last_sync'),
  ]);
  if (error) return <p className="error">The Operations Suite couldn’t load: {error.message}</p>;

  return (
    <>
      <OpsView
        view={view}
        range={r}
        today={today}
        stats={buildOps(suite)}
        syncedAt={synced || null}
      />
    </>
  );
}
