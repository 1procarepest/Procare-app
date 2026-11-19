/**
 * What shows the moment a button or link is tapped, while the next page's numbers load (Next.js loading.js).
 * withBar: the full-page version (moving between sections), with the logo bar so the page doesn't flash empty.
 */
export default function PageLoading({ withBar = false }) {
  return (
    <>
      {withBar && (
        <header className="topbar topnav">
          <img src="/logo.png" alt="Procare" />
        </header>
      )}
      <main className="admin page-loading" aria-busy="true" aria-live="polite">
        <p className="sr-only">Loading…</p>
        <div className="pl-bar" />
        <div className="pl-line pl-title" />
        <div className="pl-line" />
        <div className="pl-grid">
          <div className="pl-card" />
          <div className="pl-card" />
          <div className="pl-card" />
        </div>
        <div className="pl-line" />
        <div className="pl-line pl-short" />
      </main>
    </>
  );
}
