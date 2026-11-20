'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/finance', label: 'P&L', match: (p) => p === '/finance' },
  { href: '/finance/marketing', label: 'Marketing' },
  { href: '/finance/settings', label: 'Settings' },
];

/** Finance sections: P&L, Marketing (cost per customer) and Settings (QuickBooks link and channel matching). */
export default function FinanceTabs() {
  const path = usePathname();
  return (
    <nav className="tabs ops-tabs" aria-label="Finance">
      {TABS.map((t) => {
        const on = t.match ? t.match(path) : path.startsWith(t.href);
        return <Link key={t.href} href={t.href} className={`tab${on ? ' active' : ''}`} aria-current={on ? 'page' : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
