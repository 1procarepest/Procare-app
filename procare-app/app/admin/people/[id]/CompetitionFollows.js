'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEPT_LABEL, OFFICES, OFFICE_NAME } from '@/lib/labels';
import Picker from '../../../Picker';

const DEPTS = ['technician', 'sales', 'administrative'];
const OPTIONS = [
  { value: '', label: 'No' },
  { value: 'all', label: 'Every office' },
  ...OFFICES.map((o) => ({ value: o.key, label: o.name })),
];

/**
 * Which other competitions show on this person's profile when they aren't in them (competition_follows).
 * C-Suite and the President set it. Leads and up already see their own department's in their own office.
 */
export default function CompetitionFollows({ person, follows }) {
  const router = useRouter();
  const start = Object.fromEntries(DEPTS.map((d) => {
    const f = follows.find((x) => x.department === d);
    return [d, f ? f.office || 'all' : ''];
  }));
  const [pick, setPick] = useState(start);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [saving, setSaving] = useState(false);

  const own = person.level !== 'team_member' && person.level !== 'president'
    ? `${person.first_name} already sees ${DEPT_LABEL[person.department]} competitions in ${person.office ? OFFICE_NAME[person.office] : 'every office'}, as a ${person.level === 'lead' ? 'lead' : 'leader'}.`
    : person.level === 'president' ? 'The President sees every competition.' : '';

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', bad: false });
    const sb = createClient();
    const rows = DEPTS.filter((d) => pick[d]).map((d) => ({ employee_id: person.id, department: d, office: pick[d] === 'all' ? null : pick[d] }));
    const off = DEPTS.filter((d) => !pick[d]);
    let error = null;
    if (rows.length) ({ error } = await sb.from('competition_follows').upsert(rows, { onConflict: 'employee_id,department' }));
    if (!error && off.length) ({ error } = await sb.from('competition_follows').delete().eq('employee_id', person.id).in('department', off));
    setSaving(false);
    if (error) { setMsg({ text: error.message, bad: true }); return; }
    setMsg({ text: 'Saved.', bad: false });
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2>Competitions they also see</h2>
      <p className="note">Live competitions show on {person.first_name}’s profile even when {person.first_name} isn’t in them. {own}</p>
      <div className="row">
        {DEPTS.map((d) => (
          <div key={d} className="calc-field">
            <span className="rf-label">{DEPT_LABEL[d]}</span>
            <Picker label={`${DEPT_LABEL[d]} competitions`} value={pick[d]} options={OPTIONS} onChange={(v) => setPick({ ...pick, [d]: v })} />
          </div>
        ))}
      </div>
      {msg.text && <p className={msg.bad ? 'error' : 'ok'} role="status">{msg.text}</p>}
      <div className="panel-buttons">
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
