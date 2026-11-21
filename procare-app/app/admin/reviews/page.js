import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import ReviewsView from './ReviewsView';

export const dynamic = 'force-dynamic';

/** Year reviews (change 60): the HR approver, C-Suite, the President and managers (for their people). */
export default async function ReviewsPage({ searchParams }) {
  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!(me.rank >= 3 || me.hr_approver)) redirect('/admin');
  const { data: people, error } = await supabase.rpc('review_people');
  if (error) return <p className="error">Reviews couldn’t load: {error.message}</p>;
  const pick = (people || []).some((p) => p.id === searchParams?.person) ? searchParams.person : null;
  const { data: reviews } = pick
    ? await supabase.from('employee_reviews').select('*').eq('employee_id', pick).order('year', { ascending: false }).order('review_date', { ascending: false })
    : { data: [] };
  return <ReviewsView people={people || []} pick={pick} reviews={reviews || []} today={todayYmd()} hrForms={me.rank >= 4 || !!me.hr_approver} />;
}
