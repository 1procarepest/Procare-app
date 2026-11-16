import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { canEdit, deptsFor } from '@/lib/competitions';
import Bug from '@/app/Bug';
import CompetitionForm from '../../CompetitionForm';

export const dynamic = 'force-dynamic';

export default async function EditCompetitionPage({ params }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: comp } = await supabase.from('competitions').select('*').eq('id', params.id).maybeSingle();
  if (!comp) notFound();
  if (!canEdit(me, comp)) redirect(`/compete/${comp.id}`);
  const allowed = deptsFor(me);
  const [{ data: members }, { data: people }] = await Promise.all([
    supabase.from('competition_members').select('employee_id, team, seed').eq('competition_id', comp.id),
    supabase.from('employees').select('id, first_name, last_name, office, department, active')
      .in('department', allowed).order('first_name').order('last_name'),
  ]);
  const inIds = new Set((members || []).map((m) => m.employee_id));
  // Active people, plus anyone already in the competition who has since left
  const list = (people || []).filter((p) => p.active || inIds.has(p.id));
  return (
    <>
      <div className="rc-top brand-head"><Bug kind="cricket" size={150} className="brand-head-bug" /><div>
        <p className="rc-kicker">Edit competition</p>
        <h1 className="rc-title"><em>{comp.name}</em></h1>
      </div></div>
      <CompetitionForm me={me} people={list} allowedDepts={allowed} today={todayYmd()} comp={comp} members={members || []} />
    </>
  );
}
