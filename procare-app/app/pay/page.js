import { redirect } from 'next/navigation';

/** Pay moved into the Sales app (Sales → Pay) on 2026-11-19; old links land there. */
export default function OldPayPage({ searchParams }) {
  const q = new URLSearchParams(Object.entries(searchParams || {}).filter(([, v]) => typeof v === 'string')).toString();
  redirect(`/reps/pay${q ? `?${q}` : ''}`);
}
