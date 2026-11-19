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
  const [forgot, setForgot] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  // "Forgot passcode?": emails a one-time link to set a new one (app/login/send-reset)
  async function sendReset() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Type your company email above first.'); return; }
    setBusy(true);
    setError('');
    const res = await fetch('/login/send-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })
      .then((r) => r.json()).catch(() => ({ message: 'That didn’t go through. Check your connection and try again.' }));
    setBusy(false);
    setResetMsg(res.message);
  }

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: authError } = await createClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: passcode.trim(),   // passcodes never have spaces; phones sometimes add one at the end
    });
    if (authError) {
      const busyNow = authError.status >= 500 || /fetch|network|timeout/i.test(authError.message || '');
      setError(busyNow
        ? 'The app couldn’t reach the sign-in service. Wait a few seconds and try again.'
        : 'That email and passcode don’t match. Check both and try again, or tap “Forgot passcode?” below.');
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={(e) => { if (forgot) { e.preventDefault(); sendReset(); } else signIn(e); }}>
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
        {!forgot && <div>
          <label htmlFor="passcode">Passcode</label>
          <input
            id="passcode"
            type="password"
            autoCapitalize="off"
            autoComplete="current-password"
            required
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
        </div>}
        {error && <p className="error" role="alert">{error}</p>}
        {resetMsg && <p className="ok" role="status">{resetMsg}</p>}
        {!forgot ? (
          <>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="link login-forgot" onClick={() => { setForgot(true); setError(''); }}>Forgot passcode?</button>
          </>
        ) : (
          <>
            <p className="note">We’ll email a link to your company email to set a new passcode.</p>
            <button className="btn" type="button" disabled={busy} onClick={sendReset}>{busy ? 'Sending…' : 'Email me a link'}</button>
            <button type="button" className="link login-forgot" onClick={() => { setForgot(false); setResetMsg(''); }}>Back to sign in</button>
          </>
        )}
      </form>
    </main>
  );
}
