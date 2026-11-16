import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { canEdit } from '@/lib/competitions';
import Standings from '../Standings';

export const dynamic = 'force-dynamic';

export default async function CompetitionPage({ params }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: comp } = await supabase.from('competitions').select('*').eq('id', params.id).maybeSingle();
  if (!comp) notFound();
  const { data: board, error } = await supabase.rpc('competition_board', { p_id: comp.id });
  if (error || !board) return <p className="error">The standings couldn’t load: {error?.message || 'nothing to show'}</p>;
  return <Standings comp={comp} board={board} today={todayYmd()} meId={me.id} editable={canEdit(me, comp)} />;
}
