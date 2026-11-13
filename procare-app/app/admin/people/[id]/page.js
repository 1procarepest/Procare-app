import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import PersonEditor from './PersonEditor';

export const dynamic = 'force-dynamic';

export default async function PersonPage({ params }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);

  const { data: person } = await supabase
    .from('employees')
    .select('id, first_name, last_name, email, phone, office, department, level, active, hr_approver, auth_user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!person) notFound();

  const [{ data: schedule }, { data: canManage }, { data: canEditSchedule }] = await Promise.all([
    supabase.from('schedules').select('weekday, start_time, end_time').eq('employee_id', person.id),
    supabase.rpc('can_manage', { target: person.id }),
    supabase.rpc('can_edit_schedule', { target: person.id }),
  ]);

  return (
    <section className="section">
      <p><Link href="/admin">← All people</Link></p>
      <PersonEditor
        person={person}
        schedule={schedule || []}
        me={{ id: me.id, level: me.level, rank: me.rank, office: me.office, department: me.department }}
        canManage={!!canManage}
        canEditSchedule={!!canEditSchedule}
      />
    </section>
  );
}
