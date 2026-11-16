import Link from 'next/link';
import { APPS, appsFor } from '@/lib/apps';
import SignOut from './SignOut';
import { canSeeTeamSchedule } from '@/lib/teamSchedule';

/**
 * The bar at the top of every page: logo, links to each app the person can open, Pay (sales, and
 * people who manage pay), Compete (everyone), Settings (leads and up), and Sign out. `extra` adds a page's own sub-links.
 */
export default async function TopNav({ me, supabase, current, extra = null }) {
  const apps = appsFor(me.department, me.level);
  let pay = me.department === 'sales';
  if (!pay && me.rank >= 3) {
    const { data } = await supabase.rpc('can_manage_pay');
    pay = !!data;
  }
  // Reports (ride-alongs and follow-behinds) and Bonus: only for the people they're for (change 47)
  const { data: bonusLinks } = me.rank >= 2 || me.hr_approver ? await supabase.rpc('my_bonus_links') : { data: null };
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
        {canSeeTeamSchedule(me) && link('team', '/team', 'Schedule')}
        {bonusLinks?.reports && link('reports', '/reports', 'Reports')}
        {bonusLinks?.bonus && link('bonus', '/bonus', 'Bonus')}
        {link('compete', '/compete', 'Compete')}
        {extra}
        {me.rank >= 2 && link('settings', '/admin', 'Settings')}
        <SignOut />
      </nav>
    </header>
  );
}
