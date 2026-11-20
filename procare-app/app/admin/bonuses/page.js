import { redirect } from 'next/navigation';

/** Bonuses moved to the Bonus tab (Bonus → Manage bonuses) on 2026-11-19; old links and emails land there. */
export default function OldBonusesPage({ searchParams }) {
  const q = new URLSearchParams(Object.entries(searchParams || {}).filter(([, v]) => typeof v === 'string')).toString();
  redirect(`/bonus/manage${q ? `?${q}` : ''}`);
}
