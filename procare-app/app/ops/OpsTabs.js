'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Operations sections side by side: the Suite, AR & job pool, next month's route plan and (managers and up) Trucks. */
const TABS = [
  { href: '/ops', label: 'Operations Suite', match: (p) => p === '/ops' },
  { href: '/ops/accounts', label: 'AR & Job Pool' },
  { href: '/ops/route-plan', label: 'Route Plan for Next Month' },
  { href: '/ops/trucks', label: 'Trucks', trucks: true },
  { href: '/ops/drivers', label: 'Drivers', drivers: true },
  { href: '/ops/maintenance', label: 'Maintenance', trucks: true },
];

export default function OpsTabs({ trucks = false, drivers = false }) {
  const path = usePathname();
  return (
    <nav className="tabs ops-tabs" aria-label="Operations">
      {TABS.filter((t) => (trucks || !t.trucks) && (drivers || !t.drivers)).map((t) => {
        const on = t.match ? t.match(path) : path.startsWith(t.href);
        return <Link key={t.href} href={t.href} className={`tab${on ? ' active' : ''}`} aria-current={on ? 'page' : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
