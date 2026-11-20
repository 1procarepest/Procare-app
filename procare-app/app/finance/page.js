import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { todayYmd } from '@/lib/repcards';
import { shortDate } from '@/lib/labels';
import { buildPl, pickRange } from '@/lib/finance';
import PeriodNav from './PeriodNav';
import PlTable from './PlTable';

export const dynamic = 'force-dynamic';

/** Finance → P&L: QuickBooks P&L by class (each office, Wildlife), whole months in the period. */
export default async function FinancePage({ searchParams }) {
  const supabase = createClient();
  const today = todayYmd();
  const range = pickRange(searchParams, today);
  const { data, error } = await supabase.rpc('finance_data', { p_from: range.from, p_to: range.to });
  if (error) return <p className="error">Finance couldn’t load: {error.message}</p>;
  const conn = data?.connection || {};
  const pl = buildPl(data?.pl);

  return (
    <>
      <div className="rc-top brand-head bug-band">
        <div>
          <p className="rc-kicker">Finance · QuickBooks</p>
          <h1 className="rc-title">Profit &amp; <em>loss</em></h1>
          <p className="note">{range.label}: {shortDate(range.from)} – {shortDate(range.to)}. By QuickBooks class: each office and Wildlife.
            {conn.last_sync_at ? ` Updated from QuickBooks ${new Date(conn.last_sync_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}</p>
        </div>
      </div>
      <PeriodNav base="/finance" range={range} />
      {!conn.connected && pl.classes.length === 0 ? (
        <p className="panel">QuickBooks isn’t connected yet. <Link href="/finance/settings">Connect it in Settings</Link>.</p>
      ) : pl.classes.length === 0 ? (
        <p className="note">No QuickBooks numbers for these months yet. Try “Sync now” in <Link href="/finance/settings">Settings</Link>.</p>
      ) : <PlTable pl={pl} />}
    </>
  );
}
