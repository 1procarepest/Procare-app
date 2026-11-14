'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DEPT_LABEL, OFFICES, OFFICE_NAME, roleTitle } from '@/lib/labels';
import Face from '../Face';

export default function PeopleList({ people, myOffice, missing = [] }) {
  const [query, setQuery] = useState('');
  const [office, setOffice] = useState('all');
  const [dept, setDept] = useState('all');
  const [showInactive, setShowInactive] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => showInactive || p.active)
      .filter((p) => office === 'all' || p.office === office)
      .filter((p) => dept === 'all' || p.department === dept)
      .filter((p) => !q || `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q))
      .sort((a, b) => (a.office === myOffice ? 0 : 1) - (b.office === myOffice ? 0 : 1));
  }, [people, query, office, dept, showInactive, myOffice]);

  const noLogin = people.filter((p) => p.active && !p.auth_user_id).length;

  return (
    <section className="section">
      <div className="admin-head">
        <h1>People</h1>
        <p className="note">
          {shown.length} shown. {noLogin > 0 && `${noLogin} active ${noLogin === 1 ? 'person has' : 'people have'} no login yet.`}
        </p>
      </div>

      <div className="filters">
        <input type="search" placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
        <select value={office} onChange={(e) => setOffice(e.target.value)} aria-label="Office">
          <option value="all">All offices</option>
          {OFFICES.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="all">All departments</option>
          {Object.entries(DEPT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show deactivated team members
        </label>
      </div>

      <ul className="people">
        {shown.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/people/${p.id}`} className={`person person-with-face${p.active ? '' : ' inactive'}`}>
              <Face person={p} size={40} />
              <span className="person-main">
                <span className="person-name">{p.first_name} {p.last_name}</span>
                <span className="person-role">{roleTitle(p.department, p.level)}, {OFFICE_NAME[p.office] || 'No office'}</span>
                {p.email && <span className="person-email">{p.email}</span>}
              </span>
              <span className="person-flags">
                {!p.active && <span className="badge">Deactivated</span>}
                {p.active && !p.auth_user_id && <span className="badge badge-warn">No login</span>}
              </span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="note">Nobody matches those filters.</li>}
      </ul>

      {missing.length > 0 && (
        <section className="spaced" aria-labelledby="missing-heading">
          <h2 id="missing-heading">In FieldRoutes without an email</h2>
          <p className="note">
            These people are active in FieldRoutes but have no email there, so they can’t be added to the app.
            Add a work email to their FieldRoutes profile and they’ll be added to the app within 2 hours.
          </p>
          <ul className="missing">
            {missing.map((m) => (
              <li key={m.fr_ids}>
                <span className="person-name">{m.name}</span>
                <span className="person-role">{m.offices.split(', ').map((k) => OFFICE_NAME[k] || k).join(', ')} · FieldRoutes ID {m.fr_ids}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
