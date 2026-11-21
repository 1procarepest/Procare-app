import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { KIND_LABEL } from '@/lib/reports';
import Bug from '@/app/Bug';
import ReportForm from '../ReportForm';

export const dynamic = 'force-dynamic';

export default async function NewReportPage({ searchParams }) {
  const kind = searchParams?.kind === 'follow_behind' ? 'follow_behind' : 'ride_along';
  const supabase = createClient();
  const { me } = await getMe(supabase);
  const { data: canFile } = await supabase.rpc('can_file_reports');
  if (!canFile) redirect('/reports');
  const { data: techs, error } = await supabase.from('employees')
    .select('id, first_name, last_name, office').eq('active', true).eq('department', 'technician').in('level', ['team_member', 'lead'])
    .order('first_name').order('last_name');
  if (error) return <p className="error">The tech list couldn’t load: {error.message}</p>;
  return (
    <>
      <div className="rc-top brand-head brand-hero">
        <Bug kind={kind === 'ride_along' ? 'cricket' : 'spider'} size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker"><Link href="/reports">Forms</Link></p>
          <h1 className="rc-title">New <em>{KIND_LABEL[kind].toLowerCase()}</em></h1>
          <p className="note">{kind === 'ride_along' ? 'One per day with the tech.' : 'One per customer visit.'}</p>
        </div>
      </div>
      <ReportForm kind={kind} techs={(techs || []).filter((t) => t.id !== me.id)} today={todayYmd()} myOffice={me.office} />
    </>
  );
}
