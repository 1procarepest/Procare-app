'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Bug from '../../../Bug';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const day = (t) => (t ? new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }) : '');

/**
 * A test: start a try (the database picks the questions and shuffles the answers), answer every question, submit to be
 * graded. 100% passes; otherwise it shows which sections to reread and you can try again (a new set of questions).
 */
export default function QuizView({ quiz, doc }) {
  const router = useRouter();
  const [run, setRun] = useState(null);      // { attempt, questions }
  const [picks, setPicks] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const docHref = doc ? (doc.kind === 'link' ? doc.url : `/api/onboarding-doc?id=${doc.id}`) : null;

  const start = async () => {
    setBusy(true); setErr(''); setResult(null); setPicks({});
    const { data, error } = await createClient().rpc('start_onboarding_quiz', { p_quiz: quiz.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setRun(data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const submit = async () => {
    setBusy(true); setErr('');
    const { data, error } = await createClient().rpc('submit_onboarding_quiz', { p_attempt: run.attempt, p_answers: picks });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setResult(data); setRun(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    router.refresh();
  };

  const answered = run ? run.questions.filter((q) => picks[q.id] !== undefined).length : 0;
  const total = run?.questions.length || quiz.ask_count;

  return (
    <>
      <div className="ag-bar"><Link href="/onboarding" className="ag-back">‹ Onboarding</Link></div>

      <header className="qz-hero">
        <img className="qz-truck" src="/brand/cybertruck-1024.png" alt="" aria-hidden="true" />
        <div className="qz-hero-text">
          <p className="ag-kicker"><Bug kind="spider" size={13} />Onboarding · Test</p>
          <h1 className="ag-title">{quiz.title}</h1>
          <p className="ag-sub">{quiz.ask_count} questions a try, picked from {quiz.pool} · {quiz.pass_pct}% to pass · retake as often as you like</p>
        </div>
      </header>

      {err && <p className="error" role="status">{err}</p>}

      {!run && !result && (
        <section className="qz-card qz-intro">
          {quiz.passed_at
            ? <p className="qz-done"><img src="/stickers/best-in-pest-cybertruck-320.png" alt="" aria-hidden="true" /><span><strong>You passed on {day(quiz.passed_at)}.</strong> You can take it again any time.</span></p>
            : <p>{quiz.description}</p>}
          {quiz.tries > 0 && !quiz.passed_at && <p className="note">Tries so far: {quiz.tries}. Last score: {quiz.last_score} of {quiz.ask_count}.</p>}
          <div className="panel-buttons">
            {docHref && <a className="btn btn-quiet" href={docHref} target="_blank" rel="noreferrer">Read {doc.title}</a>}
            <button type="button" className="btn" disabled={busy} onClick={start}>{busy ? 'Starting…' : quiz.passed_at ? 'Take it again' : quiz.tries ? 'Try again' : 'Start the test'}</button>
          </div>
        </section>
      )}

      {result && (
        result.passed ? (
          <section className="qz-card qz-pass" role="status">
            <img className="qz-sticker" src="/stickers/best-in-pest-cybertruck.png" alt="The Best in Pest" />
            <div>
              <p className="ag-kicker qz-kicker-dark">Passed</p>
              <h2 className="qz-big">{result.score} of {result.total}. You’re all set.</h2>
              <p>Thanks for reading the handbook and knowing it. It’s saved on your Onboarding page.</p>
              <div className="panel-buttons"><Link className="btn" href="/onboarding">Back to Onboarding</Link></div>
            </div>
          </section>
        ) : (
          <section className="qz-card qz-fail" role="status">
            <p className="ag-kicker qz-kicker-dark">Not yet</p>
            <h2 className="qz-big">{result.score} of {result.total}</h2>
            <p>You need {result.pass_pct}% to pass. Reread these parts{doc ? ` of ${doc.title}` : ''}, then try again; you’ll get a new set of questions.</p>
            <ul className="qz-missed">
              {result.missed.map((m) => <li key={m.id}><strong>{m.section}</strong>{m.page ? <span className="ev-chip">page {m.page}</span> : null}<small>{m.q}</small></li>)}
            </ul>
            <div className="panel-buttons">
              {docHref && <a className="btn btn-quiet" href={docHref} target="_blank" rel="noreferrer">Open {doc.title}</a>}
              <button type="button" className="btn" disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Try again'}</button>
            </div>
          </section>
        )
      )}

      {run && (
        <>
          <div className="qz-progress" aria-hidden="true"><span style={{ width: `${(answered / total) * 100}%` }} /></div>
          <p className="note qz-count">{answered} of {total} answered</p>
          <ol className="qz-list">
            {run.questions.map((q, i) => (
              <li key={q.id} className={`qz-card qz-q${picks[q.id] !== undefined ? ' qz-answered' : ''}`}>
                <p className="qz-num">Question {i + 1} <span>{q.section}</span></p>
                <h3 className="qz-text">{q.q}</h3>
                <div className="qz-choices" role="radiogroup" aria-label={`Question ${i + 1}`}>
                  {q.choices.map((c, k) => (
                    <button key={k} type="button" role="radio" aria-checked={picks[q.id] === k}
                      className={`qz-choice${picks[q.id] === k ? ' on' : ''}`} onClick={() => setPicks({ ...picks, [q.id]: k })}>
                      <span className="qz-letter">{LETTERS[k]}</span><span>{c}</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <div className="qz-submit">
            <button type="button" className="btn" disabled={busy || answered < total} onClick={submit}>
              {busy ? 'Grading…' : answered < total ? `Answer all ${total} to submit` : 'Submit my answers'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
