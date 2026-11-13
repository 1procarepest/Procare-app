import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import PeopleList from './PeopleList';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: people } = await supabase
    .from('employees')
    .select('id, first_name, last_name, email, office, department, level, active, auth_user_id')
    .order('last_name')
    .order('first_name');

  return <PeopleList people={people || []} myOffice={me.office} />;
}
