import Link from 'next/link';
import { PERIODS } from '@/lib/finance';

/**
 * Period picker shared by the Finance pages: presets (?p=…) plus a custom month range (?from=YYYY-MM&to=YYYY-MM).
 * The month boxes are a plain form, so they work without any page code.
 */
export default function PeriodNav({ base, range, periods = PERIODS }) {
  return (
    <div className="fin-periods">
      <nav className="tabs tabs-inline sticky-bar" aria-label="Period">
        {periods.map((p) => (
          <Link key={p.key} href={`${base}?p=${p.key}`} className={`tab${p.key === range.key ? ' active' : ''}`} aria-current={p.key === range.key ? 'page' : undefined}>{p.label}</Link>
        ))}
      </nav>
      <form className="fin-custom" action={base} method="get">
        <label htmlFor="fin-from">From</label>
        <input id="fin-from" type="month" name="from" defaultValue={range.fromMonth} />
        <label htmlFor="fin-to">through</label>
        <input id="fin-to" type="month" name="to" defaultValue={range.toMonth} />
        <button className={`btn btn-small${range.key === 'custom' ? '' : ' btn-quiet'}`} type="submit">Show</button>
      </form>
    </div>
  );
}
