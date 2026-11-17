import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { contactsById } from '@/lib/contacts';
import PersonEditor from './PersonEditor';
import CompetitionFollows from './CompetitionFollows';

export const dynamic = 'force-dynamic';

export default async function PersonPage({ params }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);

  const [{ data: found }, contacts] = await Promise.all([
    supabase
      .from('employees')
      .select('id, first_name, last_name, office, department, level, active, deactivated_by, hr_approver, auth_user_id, photo_url')
      .eq('id', params.id)
      .maybeSingle(),
    contactsById(supabase, params.id),
  ]);
  if (!found) notFound();
  const person = { ...found, email: contacts[found.id]?.email || '', phone: contacts[found.id]?.phone || '' };

  // Today in Atlanta as YYYY-MM-DD, so requests still in progress count as upcoming.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

  const [{ data: schedule }, { data: canManage }, { data: canEditSchedule }, { data: upcoming }, { data: follows }] = await Promise.all([
    supabase.from('schedules').select('weekday, start_time, end_time').eq('employee_id', person.id),
    supabase.rpc('can_manage', { target: person.id }),
    supabase.rpc('can_edit_schedule', { target: person.id }),
    supabase
      .from('time_off_requests')
      .select('id, start_date, end_date, start_time, end_time, use_pto, note, status')
      .eq('employee_id', person.id)
      .in('status', ['approved', 'pending'])
      .gte('end_date', today)
      .order('start_date', { ascending: true }),
    supabase.from('competition_follows').select('department, office').eq('employee_id', person.id),
  ]);

  return (
    <section className="section">
      <p><Link href="/admin">← All people</Link></p>
      <PersonEditor
        person={person}
        schedule={schedule || []}
        upcoming={upcoming || []}
        me={{ id: me.id, level: me.level, rank: me.rank, office: me.office, department: me.department }}
        canManage={!!canManage}
        canEditSchedule={!!canEditSchedule}
      />
      {me.rank >= 4 && person.active && <CompetitionFollows person={person} follows={follows || []} />}
    </section>
  );
}
