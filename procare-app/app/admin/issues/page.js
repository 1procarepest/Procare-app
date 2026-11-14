import { createClient } from '@/lib/supabase/server';
import IssueList from './IssueList';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const supabase = createClient();
  const { data: issues } = await supabase
    .from('schedule_issue_reports')
    .select('id, message, status, created_at, resolved_at, employee_id, employee:employees!schedule_issue_reports_employee_id_fkey(id, first_name, last_name, office, department, level, photo_url), resolver:employees!schedule_issue_reports_resolved_by_fkey(first_name, last_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  return <IssueList issues={issues || []} />;
}
