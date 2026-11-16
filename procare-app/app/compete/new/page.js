import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { canCreate, deptsFor } from '@/lib/competitions';
import Bug from '@/app/Bug';
import CompetitionForm from '../CompetitionForm';

export const dynamic = 'force-dynamic';

export default async function NewCompetitionPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!canCreate(me)) redirect('/compete');
  const allowed = deptsFor(me);
  const { data: people, error } = await supabase
    .from('employees').select('id, first_name, last_name, office, department')
    .eq('active', true).in('department', allowed).order('first_name').order('last_name');
  if (error) return <p className="error">The team list couldn’t load: {error.message}</p>;
  return (
    <>
      <div className="rc-top brand-head"><Bug kind="cricket" size={150} className="brand-head-bug" /><div>
        <p className="rc-kicker">Competitions</p>
        <h1 className="rc-title">New <em>competition</em></h1>
      </div></div>
      <CompetitionForm me={me} people={people || []} allowedDepts={allowed} today={todayYmd()} />
    </>
  );
}
