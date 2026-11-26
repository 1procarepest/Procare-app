import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import QuizView from './QuizView';
import { groupOf } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

/** Onboarding → a test (change 94). Each try is started and graded in the database; the answer key never reaches the page. */
export default async function QuizPage({ params }) {
  const supabase = createClient();
  const [{ data, error }, { data: ob }] = await Promise.all([supabase.rpc('onboarding_quiz_data'), supabase.rpc('onboarding_data')]);
  const back = <p><Link href="/onboarding">‹ Back to Onboarding</Link></p>;
  if (error) return <>{back}<p className="error">Tests turn on once database change 94 is run in Supabase.</p></>;
  const quiz = (data?.quizzes || []).find((z) => z.id === params.id);
  if (!quiz) return <>{back}<p className="panel">That test isn’t one of yours.</p></>;
  // The document to reread: mine in the test's section, preferring one named like the test (the handbook)
  const mine = (ob?.docs || []).filter((d) => d.mine && groupOf(d.category) === groupOf(quiz.category));
  const doc = mine.find((d) => quiz.key && d.title.toLowerCase().includes(quiz.key)) || mine[0] || null;
  return <QuizView quiz={quiz} doc={doc ? { id: doc.id, title: doc.title, kind: doc.kind, url: doc.url } : null} />;
}
