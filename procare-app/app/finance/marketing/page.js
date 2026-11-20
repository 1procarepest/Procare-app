import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { todayYmd } from '@/lib/repcards';
import { shortDate } from '@/lib/labels';
import { PERIODS, buildMarketing, financeRange, money } from '@/lib/finance';
import PeriodNav from '../PeriodNav';

export const dynamic = 'force-dynamic';

const cpc = (x) => (x === null ? '–' : money(x));

/** Finance → Marketing: cost per customer by channel = QuickBooks spend ÷ new FieldRoutes customers from its lead sources. */
export default async function MarketingPage({ searchParams }) {
  const supabase = createClient();
  const today = todayYmd();
  const key = PERIODS.some((p) => p.key === searchParams?.p) ? searchParams.p : 'thisMonth';
  const range = financeRange(key, today);
  const { data, error } = await supabase.rpc('finance_data', { p_from: range.from, p_to: range.to });
  if (error) return <p className="error">Marketing couldn’t load: {error.message}</p>;
  const m = buildMarketing(data);
  const label = PERIODS.find((p) => p.key === key).label;
  const anyUnset = m.rows.some((r) => !r.set);

  return (
    <>
      <div className="rc-top brand-head bug-band">
        <div>
          <p className="rc-kicker">Finance · Marketing</p>
          <h1 className="rc-title">Cost per <em>customer</em></h1>
          <p className="note">{label}: {shortDate(range.from)} – {shortDate(range.to)}. Spend from QuickBooks ÷ new customers from FieldRoutes, by channel.</p>
        </div>
      </div>
      <PeriodNav base="/finance/marketing" current={key} />

      <div className="fin-tiles">
        <div className="fin-tile"><span className="rc-label">Marketing spend</span><strong>{money(m.total.spend)}</strong></div>
        <div className="fin-tile"><span className="rc-label">New customers</span><strong>{m.total.customers}</strong></div>
        <div className="fin-tile"><span className="rc-label">Cost per customer</span><strong>{cpc(m.total.cpc)}</strong></div>
      </div>

      {anyUnset && <p className="panel">Some channels aren’t matched yet. In <Link href="/finance/settings">Settings</Link>, pick each channel’s QuickBooks accounts (its cost) and FieldRoutes lead sources (its customers).</p>}

      <div className="pay-scroll">
        <table className="ops-table fin-table">
          <thead>
            <tr>
              <th scope="col">Channel</th><th scope="col">Spend</th><th scope="col">New customers</th><th scope="col">Cost per customer</th>
              <th scope="col">Wildlife spend</th><th scope="col">Wildlife customers</th><th scope="col">Wildlife cost per customer</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}{!r.set && <small className="fin-unset">not matched yet</small>}</th>
                <td>{money(r.spend)}</td><td>{r.customers}</td><td><b>{cpc(r.cpc)}</b></td>
                <td>{money(r.wSpend)}</td><td>{r.wCustomers}</td><td>{cpc(r.wCpc)}</td>
              </tr>
            ))}
            <tr className="fin-sum"><th scope="row">All channels</th><td>{money(m.total.spend)}</td><td>{m.total.customers}</td><td><b>{cpc(m.total.cpc)}</b></td><td /><td /><td /></tr>
          </tbody>
        </table>
      </div>

      {m.unmapped.length > 0 && (
        <p className="calc-hint">
          New customers from lead sources no channel uses yet: {m.unmapped.slice(0, 12).map(([s, n]) => `${s} (${n})`).join(', ')}.
        </p>
      )}
      <p className="calc-hint">
        New customer = a FieldRoutes customer added in these dates, credited to the lead source on what they bought. Spend = the channel’s
        QuickBooks accounts across every class; the Wildlife columns use only the Wildlife class and new wildlife customers.
        QuickBooks is by whole month.
      </p>
    </>
  );
}
