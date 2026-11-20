'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function VerifyForm({ next }) {
  const router = useRouter();
  const [step, setStep] = useState('loading');   // loading | setup | code
  const [factor, setFactor] = useState(null);     // { id, qr, secret }
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) { setMsg(error.message); setStep('code'); return; }
      const verified = (data?.totp || []).find((f) => f.status === 'verified');
      if (verified) { setFactor({ id: verified.id }); setStep('code'); return; }
      // Clear any half-finished setup, then start a new one
      for (const f of data?.all || []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: e, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Procare Team App', issuer: 'Procare Team App' });
      if (enrollError) { setMsg(enrollError.message); setStep('setup'); return; }
      setFactor({ id: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
      setStep('setup');
    })();
  }, []);

  async function verify(e) {
    e.preventDefault();
    if (!factor?.id) return;
    setBusy(true); setMsg('');
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') });
    setBusy(false);
    if (error) { setMsg('That code didn’t match. Codes change every 30 seconds: use the newest one and try again.'); return; }
    router.replace(next);
    router.refresh();
  }

  if (step === 'loading') return <p className="note">One moment…</p>;
  return (
    <section className="verify-box">
      <h1>{step === 'setup' ? 'Set up your second sign-in step' : 'Enter your 6-digit code'}</h1>
      {step === 'setup' ? (
        <>
          <p className="note">Finance shows the company’s books, so it needs a code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, or similar). You set this up once.</p>
          <ol className="verify-steps">
            <li>Open your authenticator app, tap <b>+</b>, and choose <b>Scan a QR code</b> (scan from inside the app, not with the phone’s camera).</li>
            <li>Point it at this code. Or choose <b>Enter a setup key</b> and type the key below (account name: Procare Team App, time based).</li>
            <li>A <b>Procare Team App</b> entry appears with a 6-digit number that changes every 30 seconds. Type the current number here.</li>
          </ol>
          {factor?.qr && <img className="verify-qr" src={factor.qr} alt="QR code to add Procare to your authenticator app" width="200" height="200" />}
          {factor?.secret && <p className="verify-secret">Key: <code>{factor.secret}</code></p>}
        </>
      ) : (
        <p className="note">Open your authenticator app and type the current code for <b>Procare Team App</b>.</p>
      )}
      <form onSubmit={verify} className="verify-form">
        <label htmlFor="mfa-code">6-digit code</label>
        <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} value={code}
          onChange={(e) => setCode(e.target.value)} autoFocus />
        <button className="btn" type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      <p className="calc-hint">Lost your phone? Ask the person who runs the app to reset your second step.</p>
    </section>
  );
}
