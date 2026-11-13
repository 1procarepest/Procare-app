'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME, roleTitle, shortDate } from '@/lib/labels';

function Issue({ i }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const e = i.employee || {};

  async function resolve() {
    setBusy(true);
    setError('');
    const { data, error: err } = await createClient()
      .from('schedule_issue_reports')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', i.id)
      .select('id');
    setBusy(false);
    if (err) { setError(err.message); return; }
    // Supabase skips rows the database's permission rules don't allow, without an error.
    if (!data || data.length === 0) {
      setError('This issue wasn’t marked resolved. The database didn’t allow the change for your account.');
      return;
    }
    router.refresh();
  }

  return (
    <li className="request">
      <div className="request-main">
        <Link className="person-name" href={`/admin/people/${e.id}`}>{e.first_name} {e.last_name}</Link>
        <span className="person-role">{roleTitle(e.department, e.level)}, {OFFICE_NAME[e.office] || 'No office'}. Reported {shortDate(i.created_at)}</span>
        <span>“{i.message}”</span>
        {i.status === 'resolved' && (
          <span className="note">
            Resolved{i.resolver ? ` by ${i.resolver.first_name} ${i.resolver.last_name}` : ''}{i.resolved_at ? `, ${shortDate(i.resolved_at)}` : ''}
          </span>
        )}
      </div>
      {i.status === 'open'
        ? <button className="btn btn-quiet btn-small" type="button" disabled={busy} onClick={resolve}>Mark resolved</button>
        : <span className="badge">Resolved</span>}
      {error && <p className="error" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</p>}
    </li>
  );
}

export default function IssueList({ issues }) {
  const open = issues.filter((i) => i.status === 'open');
  const resolved = issues.filter((i) => i.status !== 'open').slice(0, 30);
  return (
    <section className="section">
      <div className="admin-head">
        <h1>Schedule issues</h1>
        <p className="note">Fix the schedule on the person’s page, then mark the issue resolved.</p>
      </div>
      <h2>Open ({open.length})</h2>
      <ul className="requests">
        {open.map((i) => <Issue key={i.id} i={i} />)}
        {open.length === 0 && <li className="note">No open issues.</li>}
      </ul>
      <h2 className="spaced">Recently resolved</h2>
      <ul className="requests">
        {resolved.map((i) => <Issue key={i.id} i={i} />)}
        {resolved.length === 0 && <li className="note">Nothing resolved yet.</li>}
      </ul>
    </section>
  );
}
