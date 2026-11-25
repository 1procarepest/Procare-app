import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { loadAgreements } from '@/lib/agreementLoad';
import AgreementView from './AgreementView';

export const dynamic = 'force-dynamic';

/** Onboarding → a sales rep's agreement for a year (change 93): read, sign, countersign, print. ?year=&rep=&signed= */
export default async function AgreementPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const year = Number(searchParams?.year) || Number(todayYmd().slice(0, 4));
  const { data: payBoss } = await supabase.rpc('can_manage_pay');
  const boss = me.rank >= 4 || !!payBoss;
  const emp = boss && /^[0-9a-f-]{36}$/.test(searchParams?.rep || '') ? searchParams.rep : me.id;
  const { ready, co, list } = await loadAgreements(supabase, { years: [year], onlyEmp: emp });
  const back = <p><Link href="/onboarding">‹ Back to Onboarding</Link></p>;
  if (!ready) return <>{back}<p className="error">Sales agreements turn on once database change 93 is run in Supabase.</p></>;
  const it = list[0];
  if (!it) return <>{back}<p className="panel">There’s no {year} pay plan {emp === me.id ? 'for you' : 'for this rep'} yet, so there’s no agreement. A sales manager sets plans in Sales → Pay → Plans.</p></>;

  // An older signed copy, exactly as it was signed
  const old = searchParams?.signed ? [it.state.row, ...it.state.older].find((r) => r?.id === searchParams.signed) : null;
  return (
    <AgreementView
      item={{ employee_id: it.employee_id, name: it.name, year: it.year, plan: it.plan }}
      agreement={old ? old.body : it.agreement}
      state={old ? { key: old.company_signed_at ? 'done' : 'company', row: old, older: [] } : it.state}
      oldCopy={!!old}
      history={[it.state.row, ...it.state.older].filter(Boolean).map((r) => ({ id: r.id, signed_at: r.signed_at, title: r.title, current: r.hash === it.agreement.hash }))}
      mine={emp === me.id}
      canCountersign={me.rank >= 4}
      canEdit={me.rank >= 4}
      co={co}
    />
  );
}
