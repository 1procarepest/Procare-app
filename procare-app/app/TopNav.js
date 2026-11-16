import Link from 'next/link';
import { APPS, appsFor } from '@/lib/apps';
import SignOut from './SignOut';

/**
 * The bar at the top of every page: logo, links to each app the person can open, Pay (sales, and
 * people who manage pay), Settings (leads and up), and Sign out. `extra` adds a page's own sub-links.
 */
export default async function TopNav({ me, supabase, current, extra = null }) {
  const apps = appsFor(me.department, me.level);
  let pay = me.department === 'sales';
  if (!pay && me.rank >= 3) {
    const { data } = await supabase.rpc('can_manage_pay');
    pay = !!data;
  }
  const link = (key, href, label) => (
    <Link key={key} className={`toplink${current === key ? ' on' : ''}`} href={href} aria-current={current === key ? 'page' : undefined}>{label}</Link>
  );
  return (
    <header className="topbar topnav">
      <Link href="/" aria-label="My profile"><img src="/logo.png" alt="Procare" /></Link>
      <nav className="topbar-links" aria-label="Apps">
        {link('home', '/', 'My profile')}
        {apps.map((k) => link(k, APPS[k].href, APPS[k].short))}
        {pay && link('pay', '/pay', 'Pay')}
        {extra}
        {me.rank >= 2 && link('settings', '/admin', 'Settings')}
        <SignOut />
      </nav>
    </header>
  );
}
