'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OFFICE_NAME } from '@/lib/labels';
import { COMPETE_AS, DEFAULT_POINTS, DEPTS, KINDS } from '@/lib/competitions';

/** Create or edit a competition. `comp` and `members` are given when editing. */
export default function CompetitionForm({ me, people, allowedDepts, today, comp = null, members = [] }) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(comp?.name || '');
  const [start, setStart] = useState(comp?.start_date || today);
  const [end, setEnd] = useState(comp?.end_date || today);
  const [prize, setPrize] = useState(comp?.prize || '');
  const [as, setAs] = useState(comp?.compete_as || 'people');
  const [depts, setDepts] = useState(comp?.departments || (allowedDepts.length === 1 ? allowedDepts : ['technician', 'sales']));
  const [points, setPoints] = useState({ ...DEFAULT_POINTS, ...(comp?.points || {}) });

  // Who's in: id → team name ('' = in, no team). Missing = not in.
  const startIn = comp
    ? Object.fromEntries(members.map((m) => [m.employee_id, m.team || '']))
    : Object.fromEntries(people.filter((p) => depts.includes(p.department)).map((p) => [p.id, '']));
  const [inMap, setInMap] = useState(startIn);
  const [teams, setTeams] = useState(() => {
    const t = [...new Set(members.map((m) => m.team).filter(Boolean))];
    return t.length ? t : ['Team 1', 'Team 2'];
  });

  const shown = people.filter((p) => depts.includes(p.department));
  const chosen = shown.filter((p) => p.id in inMap && (as !== 'teams' || inMap[p.id]));

  const toggleDept = (k) => {
    const next = depts.includes(k) ? depts.filter((d) => d !== k) : [...depts, k];
    if (!next.length) return;
    setDepts(next);
    // Adding a department brings its people in; removing one leaves them out.
    const m = { ...inMap };
    people.forEach((p) => {
      if (p.department === k) { if (next.includes(k)) m[p.id] = m[p.id] ?? ''; else delete m[p.id]; }
    });
    setInMap(m);
  };
  const setPerson = (id, v) => {
    const m = { ...inMap };
    if (v === null) delete m[id]; else m[id] = v;
    setInMap(m);
  };
  const allOn = (on) => {
    const m = { ...inMap };
    shown.forEach((p) => { if (on) m[p.id] = m[p.id] ?? ''; else delete m[p.id]; });
    setInMap(m);
  };
  const renameTeam = (i, v) => {
    const old = teams[i];
    setTeams(teams.map((t, j) => (j === i ? v : t)));
    setInMap(Object.fromEntries(Object.entries(inMap).map(([id, t]) => [id, t === old ? v : t])));
  };
  const removeTeam = (i) => {
    const old = teams[i];
    setTeams(teams.filter((_, j) => j !== i));
    setInMap(Object.fromEntries(Object.entries(inMap).map(([id, t]) => [id, t === old ? '' : t])));
  };
  const shuffleTeams = () => {
    const names = teams.map((t) => t.trim()).filter(Boolean);
    if (!names.length) return;
    const ids = shown.filter((p) => p.id in inMap).map((p) => p.id).sort(() => Math.random() - 0.5);
    const m = { ...inMap };
    ids.forEach((id, i) => { m[id] = names[i % names.length]; });
    setInMap(m);
  };

  const save = async () => {
    const teamNames = teams.map((t) => t.trim()).filter(Boolean);
    if (!name.trim()) return setStatus('Give it a name.');
    if (!start || !end || end < start) return setStatus('The end date must be on or after the start date.');
    if (!chosen.length) return setStatus('Pick at least one person.');
    if (as === 'teams' && new Set(chosen.map((p) => inMap[p.id])).size < 2) return setStatus('Put people on at least two teams.');
    if (as === 'teams' && new Set(teamNames).size !== teamNames.length) return setStatus('Each team needs its own name.');
    setBusy(true);
    setStatus('Saving…');
    const row = {
      name: name.trim(), style: 'leaderboard', compete_as: as, departments: depts, start_date: start, end_date: end,
      prize: prize.trim() || null, updated_at: new Date().toISOString(),
      points: Object.fromEntries(Object.entries(points).map(([k, v]) => [k, Number(v) || 0])),
    };
    let id = comp?.id;
    if (id) {
      const { error } = await sb.from('competitions').update(row).eq('id', id);
      if (error) { setBusy(false); return setStatus(`Couldn’t save: ${error.message}`); }
      const { error: e2 } = await sb.from('competition_members').delete().eq('competition_id', id);
      if (e2) { setBusy(false); return setStatus(`Couldn’t save the people: ${e2.message}`); }
    } else {
      const { data, error } = await sb.from('competitions').insert({ ...row, created_by: me.id }).select('id').single();
      if (error) { setBusy(false); return setStatus(`Couldn’t save: ${error.message}`); }
      id = data.id;
    }
    const { error: e3 } = await sb.from('competition_members').insert(chosen.map((p) => ({
      competition_id: id, employee_id: p.id, team: as === 'teams' ? inMap[p.id] : null,
    })));
    if (e3) { setBusy(false); return setStatus(`Couldn’t save the people: ${e3.message}`); }
    router.push(`/compete/${id}`);
    router.refresh();
  };

  const remove = async () => {
    if (!comp || !window.confirm(`Delete “${comp.name}”? This can’t be undone.`)) return;
    setBusy(true);
    const { error } = await sb.from('competitions').delete().eq('id', comp.id);
    if (error) { setBusy(false); return setStatus(`Couldn’t delete: ${error.message}`); }
    router.push('/compete');
    router.refresh();
  };

  const byDept = DEPTS.filter((d) => depts.includes(d.key)).map((d) => ({ ...d, list: shown.filter((p) => p.department === d.key) }));
  const unused = KINDS.filter((k) => !depts.includes(k.dept));

  return (
    <div className="cp-form">
      {status && <p className="pay-status" role="status">{status}</p>}

      <section className="calc-card">
        <h2 className="calc-h">The basics</h2>
        <label className="calc-field"><span className="rc-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="December Auto-pay Blitz" maxLength={80} />
        </label>
        <div className="calc-row">
          <label className="calc-field"><span className="rc-label">Starts</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="calc-field"><span className="rc-label">Ends</span><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <label className="calc-field"><span className="rc-label">Prize (optional)</span>
          <input value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="$200 gift card for the winner" maxLength={160} />
        </label>
      </section>

      <section className="calc-card">
        <h2 className="calc-h">Who competes</h2>
        <div className="calc-chips" role="radiogroup" aria-label="Who competes">
          {Object.entries(COMPETE_AS).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={as === k} className={`cp-chip${as === k ? ' on' : ''}`} onClick={() => setAs(k)}>{label}</button>
          ))}
        </div>
        <p className="calc-hint">
          {as === 'people' && 'Everyone is ranked on their own points.'}
          {as === 'offices' && 'East, West and South are ranked by average points per person (office total ÷ people in that office), so office size doesn’t matter.'}
          {as === 'teams' && 'You put people on teams. Teams are ranked by average points per person, so team size doesn’t matter.'}
        </p>
        {allowedDepts.length > 1 ? (
          <>
            <span className="rc-label">Departments</span>
            <div className="calc-chips">
              {DEPTS.filter((d) => allowedDepts.includes(d.key)).map((d) => (
                <button key={d.key} type="button" aria-pressed={depts.includes(d.key)} className={`cp-chip${depts.includes(d.key) ? ' on' : ''}`} onClick={() => toggleDept(d.key)}>{d.label}</button>
              ))}
            </div>
          </>
        ) : <p className="calc-hint">For your department: {DEPTS.find((d) => d.key === allowedDepts[0])?.label}.</p>}
      </section>

      <section className="calc-card">
        <h2 className="calc-h">Points</h2>
        <div className="calc-row">
          {KINDS.map((k) => (
            <label key={k.key} className="calc-field cp-points" title={k.hint}>
              <span className="rc-label">{k.label}</span>
              <span className="calc-input">
                <input type="number" min="0" step="1" inputMode="numeric" value={points[k.key]} onChange={(e) => setPoints({ ...points, [k.key]: e.target.value })} />
                <span className="calc-affix">pts</span>
              </span>
            </label>
          ))}
          <label className="calc-field cp-points"><span className="rc-label">Reviews count at</span>
            <select value={points.review_stars} onChange={(e) => setPoints({ ...points, review_stars: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n === 5 ? '5 stars only' : `${n}+ stars`}</option>)}
            </select>
          </label>
        </div>
        <ul className="cp-hints">{KINDS.map((k) => <li key={k.key}><b>{k.label}:</b> {k.hint}</li>)}</ul>
        {depts.includes('administrative') && <p className="calc-hint">Office staff don’t earn any of these points yet.</p>}
        {unused.length > 0 && <p className="calc-hint">{unused.map((k) => k.label).join(' and ')} won’t score for the departments picked.</p>}
      </section>

      {as === 'teams' && (
        <section className="calc-card">
          <h2 className="calc-h">Teams</h2>
          <div className="cp-teams">
            {teams.map((t, i) => (
              <span key={i} className="cp-team-edit">
                <input value={t} onChange={(e) => renameTeam(i, e.target.value)} aria-label={`Team ${i + 1} name`} maxLength={40} />
                {teams.length > 2 && <button type="button" className="btn-quiet cp-x" onClick={() => removeTeam(i)} aria-label={`Remove ${t}`}>×</button>}
              </span>
            ))}
          </div>
          <div className="calc-row">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setTeams([...teams, `Team ${teams.length + 1}`])}>Add a team</button>
            <button type="button" className="btn btn-quiet btn-small" onClick={shuffleTeams}>Split everyone at random</button>
          </div>
        </section>
      )}

      <section className="calc-card">
        <div className="pay-form-head">
          <h2 className="calc-h">People ({chosen.length})</h2>
          <span className="calc-row">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => allOn(true)}>Everyone</button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => allOn(false)}>No one</button>
          </span>
        </div>
        {byDept.map((d) => (
          <div key={d.key}>
            <p className="pay-sub">{d.label}</p>
            <ul className="cp-people">
              {d.list.map((p) => (
                <li key={p.id}>
                  {as === 'teams' ? (
                    <label className="cp-person">
                      <span>{p.first_name} {p.last_name} <small>{OFFICE_NAME[p.office] || ''}</small></span>
                      <select value={p.id in inMap ? inMap[p.id] : '-'} onChange={(e) => setPerson(p.id, e.target.value === '-' ? null : e.target.value)}>
                        <option value="-">Not playing</option>
                        <option value="">No team yet</option>
                        {teams.filter((t) => t.trim()).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label className="cp-person">
                      <input type="checkbox" checked={p.id in inMap} onChange={(e) => setPerson(p.id, e.target.checked ? '' : null)} />
                      <span>{p.first_name} {p.last_name} <small>{OFFICE_NAME[p.office] || ''}</small></span>
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <div className="calc-row cp-actions">
        <button type="button" className="btn btn-small" onClick={save} disabled={busy}>{comp ? 'Save changes' : 'Start competition'}</button>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => router.back()} disabled={busy}>Cancel</button>
        {comp && <button type="button" className="btn btn-danger btn-small cp-delete" onClick={remove} disabled={busy}>Delete</button>}
      </div>
    </div>
  );
}
