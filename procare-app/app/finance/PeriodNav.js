import Link from 'next/link';
import { PERIODS } from '@/lib/finance';

/** Period picker shared by the Finance pages (?p=thisMonth …). */
export default function PeriodNav({ base, current }) {
  return (
    <nav className="tabs tabs-inline sticky-bar" aria-label="Period">
      {PERIODS.map((p) => (
        <Link key={p.key} href={`${base}?p=${p.key}`} className={`tab${p.key === current ? ' active' : ''}`} aria-current={p.key === current ? 'page' : undefined}>{p.label}</Link>
      ))}
    </nav>
  );
}
