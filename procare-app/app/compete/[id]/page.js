import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { canEdit, scorePeople } from '@/lib/competitions';
import { bracketEnd, makeEntrants } from '@/lib/bracket';
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
  if (comp.style === 'kpi') {
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

  // Lock the bracket once seeding is over and the data has caught up (first time the creator,
  // C-Suite or the President opens it), so late data can't reshuffle the seeds.
  if (comp.style === 'bracket' && editable && !comp.locked_at && today > comp.seed_end && board.through && board.through >= comp.seed_end) {
    const seeding = scorePeople(board, comp.points, comp.departments, comp.start_date, comp.seed_end);
    const entrants = makeEntrants(seeding, comp.team_size);
    const rows = entrants.flatMap((e) => e.members.map((m) => ({
      competition_id: comp.id, employee_id: m.id, seed: e.seed, team: comp.team_size > 1 ? e.name : null,
    })));
    const { error: e1 } = await supabase.from('competition_members').upsert(rows);
    if (!e1) {
      const { data: done } = await supabase.from('competitions')
        .update({ locked_at: new Date().toISOString(), end_date: bracketEnd(comp.seed_end, comp.round_days, entrants.length) })
        .eq('id', comp.id).select('*').single();
      if (done) comp = done;
      ({ data: board } = await supabase.rpc('competition_board', { p_id: comp.id }));
    }
  }

  return comp.style === 'bracket'
    ? <BracketView comp={comp} board={board} today={today} meId={me.id} editable={editable} />
    : <Standings comp={comp} board={board} today={today} meId={me.id} editable={editable} />;
}
