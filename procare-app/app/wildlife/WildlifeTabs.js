'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Wildlife section tabs: the scorecard and pay. */
export default function WildlifeTabs() {
  const path = usePathname();
  const tabs = [
    { href: '/wildlife', label: 'Scorecard', on: path === '/wildlife' },
    { href: '/wildlife/pay', label: 'Pay', on: path.startsWith('/wildlife/pay') },
  ];
  return (
    <nav className="tabs ops-tabs" aria-label="Wildlife">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={`tab${t.on ? ' active' : ''}`} aria-current={t.on ? 'page' : undefined}>{t.label}</Link>)}
    </nav>
  );
}
