import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TimeOffList from './TimeOffList';

export const dynamic = 'force-dynamic';

export default async function TimeOffPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: requests } = await supabase
    .from('time_off_requests')
    // * includes kind (sick / called out, change 60) once that change has run
    .select('*, employee:employees!time_off_requests_employee_id_fkey(first_name, last_name, office, department, level, photo_url)')
    .order('start_date', { ascending: true })
    .limit(300);

  return (
    <TimeOffList
      requests={requests || []}
      me={{ id: me.id, level: me.level, department: me.department, hr_approver: !!me.hr_approver, manages_wildlife: !!me.manages_wildlife }}
    />
  );
}
