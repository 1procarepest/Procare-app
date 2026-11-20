import VerifyForm from './VerifyForm';

export const dynamic = 'force-dynamic';

/** The second sign-in step for Finance (MFA): set up an authenticator app once, then enter its 6-digit code. */
export default function VerifyPage({ searchParams }) {
  const next = typeof searchParams?.next === 'string' && searchParams.next.startsWith('/') && !searchParams.next.startsWith('//')
    ? searchParams.next : '/finance';
  return (
    <main className="empty verify">
      <img src="/logo.png" alt="Procare" width="150" />
      <VerifyForm next={next} />
    </main>
  );
}
