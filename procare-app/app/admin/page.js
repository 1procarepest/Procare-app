import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { contactsById } from '@/lib/contacts';
import PeopleList from './PeopleList';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const [{ data: people }, contacts] = await Promise.all([
    supabase
      .from('employees')
      .select('id, first_name, last_name, office, department, level, active, auth_user_id')
      .order('last_name')
      .order('first_name'),
    contactsById(supabase),
  ]);
  const withEmail = (people || []).map((p) => ({ ...p, email: contacts[p.id]?.email || '' }));

  return <PeopleList people={withEmail} myOffice={me.office} />;
}
