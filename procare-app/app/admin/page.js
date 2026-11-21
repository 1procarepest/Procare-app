import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { contactsById } from '@/lib/contacts';
import PeopleList from './PeopleList';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const [{ data: people }, contacts, { data: missing }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, first_name, last_name, office, department, level, active, auth_user_id, photo_url')
      .order('last_name')
      .order('first_name'),
    contactsById(supabase),
    supabase.rpc('fieldroutes_missing_email'),
  ]);
  // A wildlife manager below lead (Jessica, change 79) sees the wildlife team only
  const mine = me.rank < 2 && me.manages_wildlife ? (people || []).filter((p) => p.department === 'wildlife') : people || [];
  const withEmail = mine.map((p) => ({ ...p, email: contacts[p.id]?.email || '' }));

  return <PeopleList people={withEmail} myOffice={me.office} missing={missing || []} />;
}
