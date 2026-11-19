'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Operations sections side by side: the Suite, AR & job pool, and next month's route plan. */
const TABS = [
  { href: '/ops', label: 'Operations Suite', match: (p) => p === '/ops' },
  { href: '/ops/accounts', label: 'AR & job pool' },
  { href: '/ops/route-plan', label: 'Route plan for next month' },
];

export default function OpsTabs() {
  const path = usePathname();
  return (
    <nav className="tabs ops-tabs" aria-label="Operations">
      {TABS.map((t) => {
        const on = t.match ? t.match(path) : path.startsWith(t.href);
        return <Link key={t.href} href={t.href} className={`tab${on ? ' active' : ''}`} aria-current={on ? 'page' : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
