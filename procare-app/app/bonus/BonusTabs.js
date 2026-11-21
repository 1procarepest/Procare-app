'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Bonus sub-tabs: your own goals (if you're on a bonus) and Manage bonuses (if you run them). */
export default function BonusTabs({ mine, manage }) {
  const path = usePathname();
  const tabs = [
    mine && { href: '/bonus', label: 'Your Goals', on: path === '/bonus' },
    manage && { href: '/bonus/manage', label: 'Manage Bonuses', on: path.startsWith('/bonus/manage') },
  ].filter(Boolean);
  if (tabs.length < 2) return null;
  return (
    <nav className="tabs ops-tabs" aria-label="Bonus">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={`tab${t.on ? ' active' : ''}`} aria-current={t.on ? 'page' : undefined}>{t.label}</Link>)}
    </nav>
  );
}
