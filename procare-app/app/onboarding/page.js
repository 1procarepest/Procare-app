import { createClient } from '@/lib/supabase/server';
import OnboardingView from './OnboardingView';

export const dynamic = 'force-dynamic';

/** Onboarding: the handbook, training, sales aids and contracts each person needs, with sign-offs. */
export default async function OnboardingPage() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('onboarding_data');
  if (error) {
    const missing = /onboarding_data|schema cache|does not exist/i.test(error.message);
    return <p className="error">{missing ? 'Onboarding turns on once database change 92 is run in Supabase.' : `Onboarding couldn’t load: ${error.message}`}</p>;
  }
  return <OnboardingView data={data || { docs: [], signoffs: [] }} />;
}
