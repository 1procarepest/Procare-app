'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminNav({ showSettings }) {
  const path = usePathname();
  const tabs = [
    { href: '/admin', label: 'People', match: (p) => p === '/admin' || p.startsWith('/admin/people') },
    { href: '/admin/time-off', label: 'Time off' },
    { href: '/admin/issues', label: 'Schedule issues' },
  ];
  if (showSettings) tabs.push({ href: '/admin/notifications', label: 'Email settings' });

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
