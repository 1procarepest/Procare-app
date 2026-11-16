import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { canEdit } from '@/lib/competitions';
import { lockBracket, settleCompetitions } from '@/lib/awards';
import Standings from '../Standings';
import BracketView from '../BracketView';
import KpiView from '../KpiView';

export const dynamic = 'force-dynamic';

export default async function CompetitionPage({ params }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const today = todayYmd();
  let { data: comp } = await supabase.from('competitions').select('*').eq('id', params.id).maybeSingle();
  if (!comp) notFound();
  // Other departments' competitions are hidden (C-Suite and the President see all; members and creators always can).
  if (me.rank < 4 && !comp.departments.includes(me.department) && comp.created_by !== me.id) {
    const { data: inIt } = await supabase.from('competition_members').select('employee_id').eq('competition_id', comp.id).eq('employee_id', me.id).maybeSingle();
    if (!inIt) redirect('/compete');
  }
  if (comp.style === 'kpi') {
    await settleCompetitions(supabase, today);
    const [{ data: kb, error: ke }, { data: mem }] = await Promise.all([
      supabase.rpc('office_kpi_board', { p_id: comp.id }),
      supabase.from('competition_members').select('employees(id, first_name, last_name, office)').eq('competition_id', comp.id),
    ]);
    if (ke || !kb) return <p className="error">The standings couldn’t load: {ke?.message || 'nothing to show'}</p>;
    const members = (mem || []).map((m) => m.employees).filter(Boolean).sort((a, b) => a.first_name.localeCompare(b.first_name));
    return <KpiView comp={comp} board={kb} members={members} today={today} meOffice={me.office} editable={canEdit(me, comp)} />;
  }
  let { data: board, error } = await supabase.rpc('competition_board', { p_id: comp.id });
  if (error || !board) return <p className="error">The standings couldn’t load: {error?.message || 'nothing to show'}</p>;
  const editable = canEdit(me, comp);

  // Lock the bracket once seeding is over and the data has caught up, then pay any finished rounds or places.
  if (comp.style === 'bracket' && editable && !comp.locked_at) {
    const locked = await lockBracket(supabase, comp, board, today);
    if (locked) {
      comp = locked;
      ({ data: board } = await supabase.rpc('competition_board', { p_id: comp.id }));
    }
  }
  await settleCompetitions(supabase, today);

  return comp.style === 'bracket'
    ? <BracketView comp={comp} board={board} today={today} meId={me.id} editable={editable} />
    : <Standings comp={comp} board={board} today={today} meId={me.id} editable={editable} />;
}
