import { RANK } from './labels';

/** The signed-in auth user and their active employee record (or null). */
export async function getMe(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, me: null };
  const { data: me } = await supabase
    .from('employees')
    .select('id, first_name, last_name, photo_url, office, department, level, hr_approver, offices(name)')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (me) me.rank = RANK[me.level] || 0;
  return { user, me };
}
