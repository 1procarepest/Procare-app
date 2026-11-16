'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BugTile } from '../Bug';
import Toggle from '../Toggle';
import { OFFICE_KPIS, kpiSettings } from '@/lib/officeKpis';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { addDays, bracketEnd, entrantCount, roundName, roundsFor } from '@/lib/bracket';
import { shortDate } from '@/lib/labels';
import { COMPETE_AS, DEFAULT_POINTS, DEFAULT_TIERS, DEPTS, KINDS, kindsFor, officesOnly, ordinal, usesTiers } from '@/lib/competitions';

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
  const [places, setPlaces] = useState(() => (comp?.payouts?.places?.length ? comp.payouts.places : ['']).map((x) => (Number(x) ? x : '')));
  const [rounds, setRounds] = useState(() => (comp?.payouts?.rounds || []).map((x) => (Number(x) ? x : '')));
  const [asPick, setAs] = useState(comp?.compete_as || 'people');
  const [style, setStyle] = useState(comp?.style || 'leaderboard');
  const [seedEnd, setSeedEnd] = useState(comp?.seed_end || addDays(comp?.start_date || today, 6));
  const [roundDays, setRoundDays] = useState(comp?.round_days || 7);
  const [teamSize, setTeamSize] = useState(comp?.team_size || 1);
  const locked = !!comp?.locked_at;
  const [kpis, setKpis] = useState(() => kpiSettings(comp?.points));
  const setKpi = (k, f, v) => setKpis({ ...kpis, [k]: { ...kpis[k], [f]: v } });
  const [depts, setDepts] = useState(comp?.departments || (allowedDepts.length === 1 ? allowedDepts : ['technician', 'sales']));
  const [points, setPoints] = useState({ ...DEFAULT_POINTS, ...(comp?.points || {}) });
  const [tiers, setTiers] = useState(() => (comp?.points?.tiers || DEFAULT_TIERS).map((t) => ({ ...t })));
  const savedServe = comp?.points?.serve_days;
  const [mustServe, setMustServe] = useState(savedServe !== null && savedServe !== undefined && savedServe !== '');
  const [serveDaysIn, setServeDaysIn] = useState(savedServe ?? 3);
  const setTier = (i, k, v) => setTiers(tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)));

  // Who's in: id → team name ('' = in, no team). Missing = not in.
  const startIn = comp
    ? Object.fromEntries(members.map((m) => [m.employee_id, m.team || '']))
    : Object.fromEntries(people.filter((p) => depts.includes(p.department)).map((p) => [p.id, '']));
  const [inMap, setInMap] = useState(startIn);
  const [teams, setTeams] = useState(() => {
    const t = [...new Set(members.map((m) => m.team).filter(Boolean))];
    return t.length ? t : ['Team 1', 'Team 2'];
  });

  const isBracket = style === 'bracket' && !officesOnly(depts);
  const isKpi = style === 'kpi';
  const as = officesOnly(depts) || isKpi ? 'offices' : isBracket ? (teamSize > 1 ? 'teams' : 'people') : asPick;
  const handTeams = as === 'teams' && !isBracket;   // custom teams picked by hand (leaderboards)
  const kinds = kindsFor(depts);
  const shown = people.filter((p) => depts.includes(p.department));
  const chosen = shown.filter((p) => p.id in inMap && (!handTeams || inMap[p.id]));
  const entrants = entrantCount(chosen.length, teamSize);
  const wait = mustServe ? Math.max(0, Math.round(Number(serveDaysIn) || 0)) : 0;   // days after a period for sales to be serviced
  const finalEnd = isBracket ? bracketEnd(seedEnd, Number(roundDays) || 1, entrants, wait) : end;
  const roundCount = Math.max(1, roundsFor(Math.max(2, entrants)));   // bracket rounds, for the prize per round
  const oldSeat = Object.fromEntries(members.map((m) => [m.employee_id, m]));

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
  // One office's people (in the picked departments) all on or all off
  const officeOn = (key) => { const l = shown.filter((p) => p.office === key); return l.length > 0 && l.every((p) => p.id in inMap); };
  const setOffice = (key, on) => {
    const m = { ...inMap };
    shown.filter((p) => p.office === key).forEach((p) => { if (on) m[p.id] = m[p.id] ?? ''; else delete m[p.id]; });
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
    if (isBracket && (!seedEnd || seedEnd < start)) return setStatus('Seeding has to end on or after the start date.');
    if (isBracket && !(Number(roundDays) >= 1 && Number(roundDays) <= 90)) return setStatus('Rounds must be 1 to 90 days.');
    if (!chosen.length) return setStatus('Pick at least one person.');
    if (isKpi && !Object.values(kpis).some((k) => k.on)) return setStatus('Turn on at least one KPI.');
    if (isBracket && entrants < 2) return setStatus(teamSize > 1 ? `A bracket needs at least ${teamSize * 2} people for two teams.` : 'A bracket needs at least two people.');
    if (handTeams && new Set(chosen.map((p) => inMap[p.id])).size < 2) return setStatus('Put people on at least two teams.');
    if (handTeams && new Set(teamNames).size !== teamNames.length) return setStatus('Each team needs its own name.');
    setBusy(true);
    setStatus('Saving…');
    const row = {
      name: name.trim(), style: isKpi ? 'kpi' : isBracket ? 'bracket' : 'leaderboard', compete_as: as, departments: depts, start_date: start, end_date: finalEnd,
      seed_end: isBracket ? seedEnd : null, round_days: isBracket ? Number(roundDays) : null, team_size: isBracket ? Number(teamSize) : 1,
      prize: prize.trim() || null, updated_at: new Date().toISOString(),
      payouts: isBracket
        ? { places: [], rounds: Array.from({ length: Math.max(1, roundsFor(entrants)) }, (_, i) => Number(rounds[i]) || 0) }
        : { places: places.map((x) => Number(x) || 0), rounds: [] },
      points: {
        ...Object.fromEntries(KINDS.map((k) => [k.key, Number(points[k.key]) || 0])),
        review_stars: Number(points.review_stars) || 5,
        serve_days: mustServe && kinds.some((k) => k.key === 'sale' || k.key === 'autopay') ? wait : null,
        tiers: tiers.filter((t) => t.over !== '' && t.over !== null).map((t) => ({ over: Number(t.over) || 0, pts: Number(t.pts) || 0 }))
          .sort((a, b) => a.over - b.over),
        kpis: Object.fromEntries(Object.entries(kpis).map(([k, v]) => [k, { on: !!v.on, mode: v.mode, pts: Number(v.pts) || 0, goal: Number(v.goal) || 0 }])),
      },
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
      competition_id: id, employee_id: p.id,
      // A locked bracket keeps everyone's seed and team; anyone added later isn't in the bracket.
      team: isBracket ? (locked ? oldSeat[p.id]?.team ?? null : null) : handTeams ? inMap[p.id] : null,
      seed: isBracket && locked ? oldSeat[p.id]?.seed ?? null : null,
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

  const byDept = DEPTS.filter((d) => depts.includes(d.key)).map((d) => ({
    ...d,
    offices: [...OFFICES, { key: null, name: 'No office' }]
      .map((o) => ({ ...o, list: shown.filter((p) => p.department === d.key && (p.office || null) === o.key) }))
      .filter((o) => o.list.length),
  }));
  const officeCount = (key) => chosen.filter((p) => p.office === key).length;

  return (
    <div className="cp-form">
      {status && <p className="pay-status" role="status">{status}</p>}

      <section className="calc-card">
        <h2 className="calc-h cp-h"><BugTile kind="ant" tone="ink" size={30} /> The basics</h2>
        <label className="calc-field"><span className="rc-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="December Auto-pay Blitz" maxLength={80} />
        </label>
        {(
          <div className="calc-chips" role="radiogroup" aria-label="Style">
            {[['leaderboard', 'Leaderboard'], ['bracket', 'Bracket'], ['kpi', 'Office KPIs']].filter(([k]) => k !== 'bracket' || !officesOnly(depts)).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={style === k} className={`cp-chip${style === k ? ' on' : ''}`} onClick={() => setStyle(k)} disabled={locked}>{label}</button>
            ))}
          </div>
        )}
        {isBracket ? (
          <>
            <div className="calc-row">
              <label className="calc-field"><span className="rc-label">Seeding starts</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={locked} /></label>
              <label className="calc-field"><span className="rc-label">Seeding ends</span><input type="date" value={seedEnd} min={start} onChange={(e) => setSeedEnd(e.target.value)} disabled={locked} /></label>
              <label className="calc-field cp-points"><span className="rc-label">Days per round</span>
                <span className="calc-input"><input type="number" min="1" max="90" value={roundDays} onChange={(e) => setRoundDays(e.target.value)} /><span className="calc-affix">days</span></span>
              </label>
            </div>
            <p className="calc-hint">
              Everyone competes on a leaderboard during seeding; the standings set the bracket. Round 1 starts {shortDate(addDays(seedEnd, 1 + wait))}.
              {wait > 0 && ` Each round waits ${wait} day${wait === 1 ? '' : 's'} for sales to be serviced before the next one starts.`}
              {entrants >= 2 && ` ${entrants} ${teamSize > 1 ? 'teams' : 'people'} → ${roundsFor(entrants)} rounds → final ends ${shortDate(finalEnd)}.`}
              {locked && ' The bracket is locked, so seeding can’t change.'}
            </p>
          </>
        ) : (
          <div className="calc-row">
            <label className="calc-field"><span className="rc-label">Starts</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="calc-field"><span className="rc-label">Ends</span><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
        )}
      </section>

      <section className="calc-card">
        <h2 className="calc-h cp-h"><BugTile kind="termite" tone="lime" size={30} /> Prize money</h2>
        <p className="calc-hint">
          {isBracket
            ? 'Paid to each winner of a round, growing up to the grand prize. '
            : 'Paid by place once it ends. '}
          Winnings go to each person’s profile to cash out{as !== 'people' || (isBracket && teamSize > 1) ? '; a team or office prize is split evenly among its members' : ''}. Leave $0 for no money.
        </p>
        <div className="prize-rows">
          {isBracket ? (
            Array.from({ length: roundCount }, (_, i) => (
              <div key={i} className="prize-row">
                <span className="rc-label">{i === roundCount - 1 ? 'Champion (grand prize)' : `Win ${roundName(i, roundCount)}`}</span>
                <span className="calc-input"><span className="calc-affix">$</span>
                  <input type="number" min="0" step="5" inputMode="decimal" value={rounds[i] ?? ''} placeholder="0" onChange={(e) => setRounds(Object.assign([...rounds], { [i]: e.target.value }))} aria-label={`Round ${i + 1} prize`} />
                </span>
              </div>
            ))
          ) : (
            <>
              {places.map((v, i) => (
                <div key={i} className="prize-row">
                  <span className="rc-label">{ordinal(i + 1)} place</span>
                  <span className="calc-input"><span className="calc-affix">$</span>
                    <input type="number" min="0" step="5" inputMode="decimal" value={v} placeholder="0" onChange={(e) => setPlaces(places.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${ordinal(i + 1)} place prize`} />
                  </span>
                  {i > 0 && i === places.length - 1 && <button type="button" className="btn-quiet cp-x" onClick={() => setPlaces(places.slice(0, -1))} aria-label="Remove this place">×</button>}
                </div>
              ))}
              <div><button type="button" className="btn btn-quiet btn-small" onClick={() => setPlaces([...places, ''])}>+ Add a place</button></div>
            </>
          )}
        </div>
        <label className="calc-field"><span className="rc-label">Prize note (optional)</span>
          <input value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Plus a trophy and bragging rights" maxLength={160} />
        </label>
      </section>

      <section className="calc-card">
        <h2 className="calc-h cp-h"><BugTile kind="spider" tone="forest" size={30} /> Who competes</h2>
        {isKpi ? null : isBracket ? (
          <div className="calc-chips" role="radiogroup" aria-label="Bracket entrants">
            <button type="button" role="radio" aria-checked={teamSize <= 1} className={`cp-chip${teamSize <= 1 ? ' on' : ''}`} onClick={() => setTeamSize(1)} disabled={locked}>One person each</button>
            <button type="button" role="radio" aria-checked={teamSize > 1} className={`cp-chip${teamSize > 1 ? ' on' : ''}`} onClick={() => setTeamSize(teamSize > 1 ? teamSize : 3)} disabled={locked}>Teams</button>
            {teamSize > 1 && (
              <select value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} aria-label="Team size" disabled={locked}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>of {n}</option>)}
              </select>
            )}
          </div>
        ) : (
        <div className="calc-chips" role="radiogroup" aria-label="Who competes">
          {Object.entries(COMPETE_AS).filter(([k]) => !officesOnly(depts) || k === 'offices').map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={as === k} className={`cp-chip${as === k ? ' on' : ''}`} onClick={() => setAs(k)}>{label}</button>
          ))}
        </div>
        )}
        <p className="calc-hint">
          {isBracket && teamSize > 1 && `After seeding, the app makes balanced teams of ${teamSize}: each team gets a top, a middle and a bottom finisher (leftover people join teams; scores are averages per person).`}
          {isBracket && teamSize <= 1 && 'Each person gets a bracket spot by seeding rank. Top seeds get byes if the numbers aren’t even.'}
          {!isBracket && as === 'people' && 'Everyone is ranked on their own points.'}
          {isKpi && 'East, West and South compete on rates (percentages), so a small office can beat a big one. Pick who’s on each office’s team below. '}
          {!isKpi && officesOnly(depts) && 'More than one department is company-wide, so it’s always office vs. office. '}
          {!isKpi && as === 'offices' && 'East, West and South are ranked by average points per person (office total ÷ people in that office), so office size doesn’t matter.'}
          {handTeams && 'You put people on teams. Teams are ranked by average points per person, so team size doesn’t matter.'}
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

      {isKpi && (
        <section className="calc-card">
          <h2 className="calc-h cp-h"><BugTile kind="stinging" tone="lime" size={30} /> Office KPIs</h2>
          <p className="calc-hint">Turn on the KPIs to compete on. <b>By place:</b> 1st gets 3 × the weight, 2nd 2 ×, 3rd 1 ×. <b>By goal:</b> every office that hits the goal gets the points. For a cancellation contest, turn on only Retention with a goal like 1%.</p>
          <div className="kpi-rows">
            {OFFICE_KPIS.map((k) => {
              const c = kpis[k.key];
              return (
                <div key={k.key} className={`kpi-row${c.on ? '' : ' off'}`}>
                  <Toggle className="kpi-on" checked={c.on} onChange={(v) => setKpi(k.key, 'on', v)} label={k.label}>
                    <BugTile kind={k.bug} tone={c.on ? 'forest' : 'sage'} size={28} />
                    <span className="kpi-text"><b>{k.label}</b><small>{k.hint}</small></span>
                  </Toggle>
                  {c.on && (
                    <div className="kpi-set">
                      <select value={c.mode} onChange={(e) => setKpi(k.key, 'mode', e.target.value)} aria-label={`${k.label} scoring`}>
                        <option value="place">By place</option>
                        <option value="goal">By goal</option>
                      </select>
                      {c.mode === 'goal' && (
                        <span className="calc-input">
                          <span className="calc-affix">{k.better === 'high' ? 'At least' : 'Under'}</span>
                          <input type="number" min="0" step="0.1" inputMode="decimal" value={c.goal} onChange={(e) => setKpi(k.key, 'goal', e.target.value)} aria-label={`${k.label} goal`} />
                          <span className="calc-affix">{k.unit}</span>
                        </span>
                      )}
                      <span className="calc-input">
                        <span className="calc-affix">{c.mode === 'goal' ? 'Worth' : 'Weight'}</span>
                        <input type="number" min="0" step="0.5" inputMode="decimal" value={c.pts} onChange={(e) => setKpi(k.key, 'pts', e.target.value)} aria-label={`${k.label} points`} />
                        <span className="calc-affix">{c.mode === 'goal' ? 'pts' : '×'}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!isKpi && <section className="calc-card">
        <h2 className="calc-h cp-h"><BugTile kind="stinging" tone="lime" size={30} /> Points</h2>
        {kinds.length === 0 && <p className="calc-hint">Office KPI scoring (accounts receivable, job pool, retention) is coming next. For now, pick Technicians or Sales.</p>}
        <div className="calc-row">
          {kinds.map((k) => (
            <label key={k.key} className="calc-field cp-points" title={k.hint}>
              <span className="rc-label">{k.label}</span>
              <span className="calc-input">
                <input type="number" min="0" step="0.5" inputMode="decimal" value={points[k.key]} onChange={(e) => setPoints({ ...points, [k.key]: e.target.value })} />
                <span className="calc-affix">pts</span>
              </span>
            </label>
          ))}
          {kinds.some((k) => k.key === 'review') && (
            <label className="calc-field cp-points"><span className="rc-label">Reviews count at</span>
              <select value={points.review_stars} onChange={(e) => setPoints({ ...points, review_stars: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n === 5 ? '5 stars only' : `${n}+ stars`}</option>)}
              </select>
            </label>
          )}
        </div>
        {kinds.length > 0 && <ul className="cp-hints">{kinds.map((k) => <li key={k.key}><b>{k.label}:</b> {k.hint}</li>)}</ul>}
        {kinds.some((k) => k.key === 'sale') && (
          <div className="cp-tiers">
            <Toggle checked={mustServe} onChange={setMustServe}>
              <span className="cp-person-text"><b>Sales must be serviced to count</b><small>The sale, its auto-pay and its contract bonus count only once the first service is done. Until then they show as pending.</small></span>
            </Toggle>
            {mustServe && (
              <div className="calc-row cp-tier">
                <span className="calc-input">
                  <span className="calc-affix">Serviced within</span>
                  <input type="number" min="0" max="30" step="1" inputMode="numeric" value={serveDaysIn} onChange={(e) => setServeDaysIn(e.target.value)} aria-label="Days after the end to be serviced" />
                  <span className="calc-affix">days after the end</span>
                </span>
                <span className="calc-hint">
                  {isBracket
                    ? `Each round (and seeding) waits ${wait} day${wait === 1 ? '' : 's'} for services before the next round starts.`
                    : `Results are final ${wait ? `${wait} day${wait === 1 ? '' : 's'} after the end (${shortDate(addDays(end, wait))})` : 'at the end'}; sales not serviced by then don’t count.`}
                </span>
              </div>
            )}
          </div>
        )}
        {usesTiers(depts) && (
          <div className="cp-tiers">
            <span className="rc-label">Pest contract value bonus</span>
            <p className="calc-hint">Extra points for each serviced pest-control sale with a contract value over each amount. Tiers add up. Set points to 0 to turn one off.</p>
            {tiers.map((t, i) => (
              <div key={i} className="calc-row cp-tier">
                <span className="calc-input">
                  <span className="calc-affix">Over $</span>
                  <input type="number" min="0" step="10" inputMode="decimal" value={t.over} onChange={(e) => setTier(i, 'over', e.target.value)} aria-label={`Tier ${i + 1} contract value`} />
                </span>
                <span className="calc-input">
                  <span className="calc-affix">+</span>
                  <input type="number" min="0" step="0.5" inputMode="decimal" value={t.pts} onChange={(e) => setTier(i, 'pts', e.target.value)} aria-label={`Tier ${i + 1} points`} />
                  <span className="calc-affix">pts</span>
                </span>
                {tiers.length > 1 && <button type="button" className="btn-quiet cp-x" onClick={() => setTiers(tiers.filter((_, j) => j !== i))} aria-label={`Remove tier ${i + 1}`}>×</button>}
              </div>
            ))}
            <div><button type="button" className="btn btn-quiet btn-small" onClick={() => setTiers([...tiers, { over: (Number(tiers[tiers.length - 1]?.over) || 420) + 180, pts: 0.5 }])}>+ Add a tier</button></div>
          </div>
        )}
      </section>}

      {handTeams && (
        <section className="calc-card">
          <h2 className="calc-h cp-h"><BugTile kind="roach" tone="sage" size={30} /> Teams</h2>
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
          <h2 className="calc-h cp-h"><BugTile kind="cricket" tone="ink" size={30} /> People ({chosen.length})</h2>
          <span className="calc-row">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => allOn(true)}>Everyone</button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => allOn(false)}>No one</button>
          </span>
        </div>
        <div className="cp-office-toggles" role="group" aria-label="Offices">
          {OFFICES.filter((o) => shown.some((p) => p.office === o.key)).map((o) => (
            <Toggle key={o.key} className={`cp-office-toggle${officeOn(o.key) ? ' on' : ''}`} checked={officeOn(o.key)} onChange={(v) => setOffice(o.key, v)} label={`${o.name}: everyone on or off`}>
              <span className="cp-person-text"><b>{o.name.replace('Atlanta ', '')}</b><small>{officeCount(o.key)} of {shown.filter((p) => p.office === o.key).length} in</small></span>
            </Toggle>
          ))}
        </div>
        {byDept.map((d) => (
          <div key={d.key}>
            {byDept.length > 1 && <p className="pay-sub">{d.label}</p>}
            {d.offices.map((o) => (
              <div key={o.key || 'none'} className="cp-office-group">
                <p className="cp-office-label">{d.label} · {o.name}</p>
                <ul className="cp-people">
                  {o.list.map((p) => (
                    <li key={p.id}>
                      {handTeams ? (
                        <label className="cp-person">
                          <span>{p.first_name} {p.last_name}</span>
                          <select value={p.id in inMap ? inMap[p.id] : '-'} onChange={(e) => setPerson(p.id, e.target.value === '-' ? null : e.target.value)}>
                            <option value="-">Not playing</option>
                            <option value="">No team yet</option>
                            {teams.filter((t) => t.trim()).map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </label>
                      ) : (
                        <Toggle small className="cp-person-toggle" checked={p.id in inMap} onChange={(v) => setPerson(p.id, v ? '' : null)}>
                          <span className="cp-person-text">{p.first_name} {p.last_name}</span>
                        </Toggle>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
