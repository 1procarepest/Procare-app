import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import QuizView from './QuizView';

export const dynamic = 'force-dynamic';

/** Onboarding → a test (change 94). Each try is started and graded in the database; the answer key never reaches the page. */
export default async function QuizPage({ params }) {
  const supabase = createClient();
  const [{ data, error }, { data: ob }] = await Promise.all([supabase.rpc('onboarding_quiz_data'), supabase.rpc('onboarding_data')]);
  const back = <p><Link href="/onboarding">‹ Back to Onboarding</Link></p>;
  if (error) return <>{back}<p className="error">Tests turn on once database change 94 is run in Supabase.</p></>;
  const quiz = (data?.quizzes || []).find((z) => z.id === params.id);
  if (!quiz) return <>{back}<p className="panel">That test isn’t one of yours.</p></>;
  // The document to reread: the first one of mine in the test's section (e.g. the handbook)
  const doc = (ob?.docs || []).find((d) => d.mine && d.category === quiz.category) || null;
  return <QuizView quiz={quiz} doc={doc ? { id: doc.id, title: doc.title, kind: doc.kind, url: doc.url } : null} />;
}
