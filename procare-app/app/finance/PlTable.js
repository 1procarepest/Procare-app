'use client';

import { Fragment, useState } from 'react';
import { SECTIONS, money } from '@/lib/finance';

const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '');

/** The P&L as a table: one column per class plus Total; tap a section to see its accounts. */
export default function PlTable({ pl }) {
  const { classes, sections, totals } = pl;
  const [open, setOpen] = useState({});
  const income = sections.Income;
  const row = (label, by, total, cls = '') => (
    <tr className={cls}>
      <th scope="row">{label}</th>
      {classes.map((c) => <td key={c}>{money(by[c])}</td>)}
      <td className="fin-total">{money(total)}</td>
    </tr>
  );
  const sectionRows = (name) => {
    const s = sections[name];
    if (!s.accounts.length) return null;
    const isOpen = !!open[name];
    return (
      <Fragment key={name}>
        <tr className="fin-section">
          <th scope="row">
            <button type="button" className="link" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [name]: !o[name] }))}>
              {isOpen ? '▾' : '▸'} {name}
            </button>
          </th>
          {classes.map((c) => <td key={c}>{money(s.by[c])}</td>)}
          <td className="fin-total">{money(s.total)}</td>
        </tr>
        {isOpen && s.accounts.map((a) => (
          <tr key={`${a.parent}|${a.name}`} className="fin-account">
            <th scope="row">{a.parent ? <span className="fin-parent">{a.parent} · </span> : null}{a.name}</th>
            {classes.map((c) => <td key={c}>{a.by[c] ? money(a.by[c]) : '–'}</td>)}
            <td className="fin-total">{money(a.total)}</td>
          </tr>
        ))}
      </Fragment>
    );
  };
  return (
    <div className="pay-scroll">
      <table className="ops-table fin-table">
        <thead>
          <tr><th scope="col">Account</th>{classes.map((c) => <th key={c} scope="col">{c}</th>)}<th scope="col">Total</th></tr>
        </thead>
        <tbody>
          {sectionRows(SECTIONS[0])}
          {sectionRows(SECTIONS[1])}
          {row('Gross profit', totals.gross.by, totals.gross.total, 'fin-sum')}
          {sectionRows(SECTIONS[2])}
          {row('Net operating income', totals.operating.by, totals.operating.total, 'fin-sum')}
          {sectionRows(SECTIONS[3])}
          {sectionRows(SECTIONS[4])}
          {row('Net income', totals.net.by, totals.net.total, 'fin-sum fin-net')}
          <tr className="fin-margin">
            <th scope="row">Net margin</th>
            {classes.map((c) => <td key={c}>{pct(totals.net.by[c], income.by[c])}</td>)}
            <td className="fin-total">{pct(totals.net.total, income.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
