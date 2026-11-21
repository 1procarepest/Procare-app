import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { todayYmd } from '@/lib/repcards';
import { REVIEW_KIND } from '@/lib/reviews';
import Bug from '@/app/Bug';
import ReviewForm from '../ReviewForm';

export const dynamic = 'force-dynamic';

/** Forms → 6 Month Check-In (?kind=checkin) or Yearly Review (?kind=yearly), change 73. ?person= picks the team member. */
export default async function NewReviewPage({ searchParams }) {
  const kind = searchParams?.kind === 'yearly' ? 'yearly' : 'checkin';
  const supabase = createClient();
  const { me } = await getMe(supabase);
  // C-Suite and the President only (John, 2026-11-20)
  if (!me || (me.rank < 4 && !me.hr_approver)) redirect('/reports');   // Ally (HR approver), C-Suite, the President
  const { data: people, error } = await supabase.rpc('review_people');
  if (error) return <p className="error">The team list couldn’t load: {error.message}</p>;
  const list = people || [];
  const start = list.some((p) => p.id === searchParams?.person) ? searchParams.person : '';
  return (
    <>
      <div className="rc-top brand-head brand-hero">
        <Bug kind={kind === 'yearly' ? 'stinging' : 'ant'} size={150} className="brand-head-bug" />
        <div>
          <p className="rc-kicker"><Link href="/reports">Forms</Link> · HR who cares</p>
          <h1 className="rc-title">{kind === 'yearly' ? <>Yearly <em>review</em></> : <>6 month <em>check-in</em></>}</h1>
          <p className="note">{kind === 'yearly'
            ? 'Sit down together and write their answers in their own words.'
            : 'Halfway through the year: how it’s going, what they need, and the last couple of ride-alongs.'}</p>
        </div>
      </div>
      <ReviewForm kind={kind} people={list} today={todayYmd()} start={start} key={kind} />
      <p className="calc-hint">{REVIEW_KIND[kind].label}s are saved with their reviews in <Link href="/admin/reviews">Settings → Reviews</Link>.</p>
    </>
  );
}
