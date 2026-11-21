'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Ads sections: Overview, Leads, Website and (C-Suite / President) Settings. */
export default function AdsTabs({ manage }) {
  const path = usePathname();
  const tabs = [
    { href: '/ads', label: 'Overview', match: (p) => p === '/ads' },
    { href: '/ads/leads', label: 'Leads' },
    { href: '/ads/website', label: 'Website' },
    ...(manage ? [{ href: '/ads/settings', label: 'Settings' }] : []),
  ];
  return (
    <nav className="tabs ops-tabs" aria-label="Marketing">
      {tabs.map((t) => {
        const on = t.match ? t.match(path) : path.startsWith(t.href);
        return <Link key={t.href} href={t.href} className={`tab${on ? ' active' : ''}`} aria-current={on ? 'page' : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
