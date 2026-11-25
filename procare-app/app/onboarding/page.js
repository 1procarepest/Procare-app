import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { loadAgreements } from '@/lib/agreementLoad';
import OnboardingView from './OnboardingView';

export const dynamic = 'force-dynamic';

/** Short form of an agreement for the Onboarding list (no wording). */
const brief = (x) => ({
  employee_id: x.employee_id, name: x.name, office: x.office, active: x.active, year: x.year, plan: x.plan, title: x.agreement.title,
  state: x.state.key, signed_at: x.state.row?.signed_at || null, company_signed_at: x.state.row?.company_signed_at || null,
});

/** Onboarding: the handbook, training, sales aids and contracts each person needs, with sign-offs. */
export default async function OnboardingPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const thisYear = Number(todayYmd().slice(0, 4));
  const years = [thisYear, thisYear + 1];
  const [{ data, error }, { data: payBoss }] = await Promise.all([supabase.rpc('onboarding_data'), supabase.rpc('can_manage_pay')]);
  if (error) {
    const missing = /onboarding_data|schema cache|does not exist/i.test(error.message);
    return <p className="error">{missing ? 'Onboarding turns on once database change 92 is run in Supabase.' : `Onboarding couldn’t load: ${error.message}`}</p>;
  }
  // Sales agreements (change 93): mine, and everyone's for the people who manage pay
  const boss = me.rank >= 4 || !!payBoss;
  const ag = await loadAgreements(supabase, { years, onlyEmp: boss ? null : me.id }).catch(() => ({ ready: false, list: [] }));
  const agreements = ag.ready ? {
    mine: ag.list.filter((x) => x.employee_id === me.id).map(brief),
    team: boss ? ag.list.filter((x) => x.active).map(brief) : [],
  } : { mine: [], team: [] };
  return <OnboardingView data={data || { docs: [], signoffs: [] }} agreements={agreements} />;
}
