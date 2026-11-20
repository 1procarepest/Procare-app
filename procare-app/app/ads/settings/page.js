import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { gadsConfigured } from '@/lib/gads';
import { listProperties, NEEDS_RECONNECT } from '@/lib/ga';
import AdsSettings from './AdsSettings';

export const dynamic = 'force-dynamic';

const NOTICE = {
  connected: { ok: true, text: 'Google Ads is connected. The last 90 days were copied; it refreshes every morning.' },
  declined: { ok: false, text: 'Google Ads wasn’t connected (the sign-in was cancelled).' },
  expired: { ok: false, text: 'That sign-in took too long or came from another window. Try Connect again.' },
  missing: { ok: false, text: 'Google didn’t send back a sign-in. Try Connect again.' },
  'not-configured': { ok: false, text: 'The app’s Google keys aren’t set up in Vercel yet (GADS_CLIENT_ID and GADS_CLIENT_SECRET).' },
};

/** Ads → Settings (C-Suite / President): the Google link, each account's office, the Google lead sources and who sees Ads. */
export default async function AdsSettingsPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me || me.rank < 4) redirect('/ads');
  const today = todayYmd();
  const { data, error } = await supabase.rpc('ads_data', { p_from: today, p_to: today });
  if (error) return <p className="error">Ads settings couldn’t load: {error.message}</p>;
  // The website's Analytics property: the ones this Google sign-in can see
  let properties = [];
  let propError = '';
  const { data: web } = await supabase.rpc('website_data', { p_from: today, p_to: today });
  if (data?.connection?.connected) {
    try {
      properties = await listProperties();
    } catch (e) {
      propError = String(e.message || e) === NEEDS_RECONNECT ? NEEDS_RECONNECT : String(e.message || e);
    }
  }
  const q = searchParams?.gads;
  const notice = q === 'error' ? { ok: false, text: `Google Ads couldn’t connect: ${searchParams?.msg || 'unknown error'}` } : NOTICE[q] || null;
  return (
    <AdsSettings
      connection={data?.connection || {}}
      configured={gadsConfigured()}
      accounts={data?.accounts || []}
      offices={data?.offices || []}
      sources={(data?.all_sources || []).slice().sort()}
      picked={data?.fr_sources || []}
      people={data?.people || []}
      properties={properties}
      property={web?.property || {}}
      propError={propError}
      notice={notice}
    />
  );
}
