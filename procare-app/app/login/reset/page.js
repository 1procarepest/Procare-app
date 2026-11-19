'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Opened from the "Set a new passcode" email: checks the one-time link, then sets the new passcode. */
function Reset() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState('checking');   // checking | ready | bad | done
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = params.get('token_hash');
    if (!token) { setState('bad'); return; }
    createClient().auth.verifyOtp({ type: 'recovery', token_hash: token })
      .then(({ error: e }) => setState(e ? 'bad' : 'ready'));
  }, [params]);

  async function save(e) {
    e.preventDefault();
    if (!/^\S{6,64}$/.test(next)) { setError('Passcodes are 6 to 64 letters, numbers or symbols, with no spaces.'); return; }
    if (next !== again) { setError('The two passcodes don’t match. Type it the same way both times.'); return; }
    setBusy(true);
    setError('');
    const { error: err } = await createClient().auth.updateUser({ password: next });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setState('done');
    setTimeout(() => { router.replace('/'); router.refresh(); }, 1500);
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={save}>
        <img className="login-logo" src="/logo.png" alt="Procare" />
        <h1>New passcode</h1>
        {state === 'checking' && <p className="note">Checking your link…</p>}
        {state === 'bad' && (
          <>
            <p className="error" role="alert">This link has expired or was already used. Links work once, for an hour.</p>
            <a className="btn" href="/login">Back to sign in</a>
          </>
        )}
        {state === 'done' && <p className="ok" role="status">Passcode saved. Signing you in…</p>}
        {state === 'ready' && (
          <>
            <div>
              <label htmlFor="next">New passcode</label>
              <input id="next" type="password" autoCapitalize="off" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <label htmlFor="again">Type it again</label>
              <input id="again" type="password" autoCapitalize="off" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save passcode'}</button>
          </>
        )}
      </form>
    </main>
  );
}

export default function ResetPage() {
  return <Suspense fallback={null}><Reset /></Suspense>;
}
