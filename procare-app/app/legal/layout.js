/** Public legal pages (no sign-in): the terms and privacy policy Intuit asks for to connect QuickBooks. */
export const metadata = { title: 'Procare Team · Legal' };

export default function LegalLayout({ children }) {
  return (
    <>
      <header className="topbar"><img src="/logo.png" alt="Procare" /></header>
      <main className="admin legal">{children}</main>
    </>
  );
}
