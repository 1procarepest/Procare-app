import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import RulesEditor from './RulesEditor';

export const dynamic = 'force-dynamic';

export default async function RulesPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (me.rank < 4) redirect('/scorecard');
  const { data } = await supabase
    .from('scorecard_rules')
    .select('rules, updated_at, editor:employees!scorecard_rules_updated_by_fkey(first_name, last_name)')
    .eq('id', 1)
    .maybeSingle();

  return (
    <>
      <div className="admin-head">
        <h1>Performance Card rules</h1>
        <p className="note">
          Amounts are per month. Weeks and part-months are prorated, except the per-review and per-sale amounts.
          {data?.editor ? ` Last changed by ${data.editor.first_name} ${data.editor.last_name}, ${new Date(data.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}.` : ''}
        </p>
      </div>
      <RulesEditor initial={data?.rules || {}} myId={me.id} />
    </>
  );
}
