'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Sales app sections: Rep Cards (with the leaderboard and work areas) and Pay (for those who see pay). */
export default function SalesTabs({ showPay }) {
  const path = usePathname();
  if (!showPay) return null;
  const tabs = [
    { href: '/reps', label: 'Rep Cards & Leaderboard', on: !path.startsWith('/reps/pay') },
    { href: '/reps/pay', label: 'Pay', on: path.startsWith('/reps/pay') },
  ];
  return (
    <nav className="tabs ops-tabs" aria-label="Sales">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={`tab${t.on ? ' active' : ''}`} aria-current={t.on ? 'page' : undefined}>{t.label}</Link>)}
    </nav>
  );
}
