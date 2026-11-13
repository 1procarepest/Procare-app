'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: authError } = await createClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: passcode,
    });
    if (authError) {
      setError('That email and passcode don’t match. Check both and try again, or ask your lead to reset your passcode.');
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={signIn}>
        <img className="login-logo" src="/logo.png" alt="Procare" />
        <h1>Sign in</h1>
        <div>
          <label htmlFor="email">Company email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="passcode">Passcode</label>
          <input
            id="passcode"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
