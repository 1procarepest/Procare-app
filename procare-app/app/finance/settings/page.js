import { createClient } from '@/lib/supabase/server';
import { todayYmd } from '@/lib/repcards';
import { qboConfigured } from '@/lib/qbo';
import FinanceSettings from './FinanceSettings';

export const dynamic = 'force-dynamic';

const NOTICE = {
  connected: { ok: true, text: 'QuickBooks is connected. The last 13 months were copied; it refreshes every morning.' },
  declined: { ok: false, text: 'QuickBooks wasn’t connected (the sign-in was cancelled).' },
  expired: { ok: false, text: 'That sign-in took too long or came from another window. Try Connect again.' },
  missing: { ok: false, text: 'QuickBooks didn’t send back a company. Try Connect again and pick the company.' },
  'not-configured': { ok: false, text: 'The app’s QuickBooks keys aren’t set up in Vercel yet (QBO_CLIENT_ID and QBO_CLIENT_SECRET).' },
};

/** Finance → Settings: the QuickBooks link and which accounts / lead sources make up each marketing channel. */
export default async function FinanceSettingsPage({ searchParams }) {
  const supabase = createClient();
  const today = todayYmd();
  const from = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
  const { data, error } = await supabase.rpc('finance_data', { p_from: from, p_to: today });
  if (error) return <p className="error">Finance settings couldn’t load: {error.message}</p>;
  const q = searchParams?.qbo;
  const notice = q === 'error' ? { ok: false, text: `QuickBooks couldn’t connect: ${searchParams?.msg || 'unknown error'}` } : NOTICE[q] || null;
  return (
    <FinanceSettings
      connection={data?.connection || {}}
      configured={qboConfigured()}
      channels={data?.channels || []}
      accounts={(data?.accounts || []).filter((a) => a.section !== 'Income' && a.section !== 'Other Income').map((a) => a.name).sort()}
      sources={(data?.sources || []).slice().sort()}
      notice={notice}
    />
  );
}
