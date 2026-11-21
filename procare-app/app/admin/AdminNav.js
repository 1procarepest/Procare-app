'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminNav({ showSettings, showPayouts, showReviews }) {
  const path = usePathname();
  const tabs = [
    { href: '/admin', label: 'People', match: (p) => p === '/admin' || p.startsWith('/admin/people') },
    { href: '/admin/time-off', label: 'Time Off' },
    { href: '/admin/issues', label: 'Schedule Issues' },
  ];
  // Payroll time off and year reviews (change 60)
  if (showPayouts) tabs.push({ href: '/admin/payroll', label: 'Payroll' });
  if (showReviews) tabs.push({ href: '/admin/reviews', label: 'Reviews' });
  if (showPayouts) tabs.push({ href: '/admin/payouts', label: 'Prize Payouts' });
  if (showSettings) tabs.push({ href: '/admin/notifications', label: 'Email Settings' });
  if (showSettings) tabs.push({ href: '/admin/holidays', label: 'Holidays' });

  return (
    <nav className="tabs" aria-label="Team management">
      {tabs.map((t) => {
        const active = t.match ? t.match(path) : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`tab${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
