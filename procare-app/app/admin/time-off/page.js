import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import TimeOffList from './TimeOffList';

export const dynamic = 'force-dynamic';

export default async function TimeOffPage() {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: requests } = await supabase
    .from('time_off_requests')
    .select('id, start_date, end_date, start_time, end_time, use_pto, note, status, decision_note, created_at, decided_at, decided_by, employee_id, employee:employees!time_off_requests_employee_id_fkey(first_name, last_name, office, department, level)')
    .order('start_date', { ascending: true })
    .limit(300);

  return (
    <TimeOffList
      requests={requests || []}
      me={{ id: me.id, level: me.level, department: me.department, hr_approver: !!me.hr_approver }}
    />
  );
}
