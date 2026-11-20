import { money0 } from '@/lib/ops';
import { OFFICES, OFFICE_NAME } from '@/lib/labels';
import { CritterTile } from '../Critter';

/** Wildlife services: sold (by who sold it in FieldRoutes) and done (by who serviced it), count and dollars. */
const LINES = [
  { key: 'exclusion', label: 'Exclusions', critter: 'squirrel', tone: 'forest' },
  { key: 'warranty', label: 'Wildlife Warranty', critter: 'bat', tone: 'ink', note: 'Revenue only, not paid as commission' },
  { key: 'trapping', label: 'Trapping', critter: 'raccoon', tone: 'sage' },
  { key: 'insulation', label: 'Insulation', critter: 'mice', tone: 'lime' },
];

function sumBy(list, id, line, which, office) {
  return (list || []).filter((x) => x.which === which && (!id || x.id === id) && (!line || x.line === line) && (!office || x.office === office))
    .reduce((t, x) => ({ n: t.n + Number(x.n || 0), amt: t.amt + Number(x.amt || 0) }), { n: 0, amt: 0 });
}
const cell = (v) => (v.n ? <>{v.n}<span className="cell-sub">{money0(v.amt)}</span></> : '–');

export default function WildlifeSales({ people, data }) {
  const sold = data?.sold || [];
  const done = data?.done || [];
  // By the customer's office (change 68), not the technician's home office
  const soldOff = data?.sold_office || [];
  const doneOff = data?.done_office || [];
  const officeKeys = [...new Set([...OFFICES.map((o) => o.key), ...soldOff.map((x) => x.office), ...doneOff.map((x) => x.office)])]
    .filter((k) => k && (sumBy(soldOff, null, null, 'cur', k).n || sumBy(doneOff, null, null, 'cur', k).n));
  const names = (data?.names || []).map((x) => x.name).sort();
  return (
    <section className="wl-sales" aria-labelledby="wl-sales-h">
      <h2 id="wl-sales-h">Wildlife services</h2>
      <div className="wl-cards">
        {LINES.map((l) => {
          const s = sumBy(sold, null, l.key, 'cur');
          const d = sumBy(done, null, l.key, 'cur');
          const p = sumBy(sold, null, l.key, 'prior');
          return (
            <div key={l.key} className="wl-card">
              <CritterTile kind={l.critter} tone={l.tone} size={40} />
              <div>
                <h3>{l.label}</h3>
                <p><b>{s.n}</b> sold · {money0(s.amt)}</p>
                <p className="note">{d.n} done · {money0(d.amt)} · before: {p.n} sold</p>
                {l.note && <p className="note wl-note">{l.note}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {people.length > 0 && (
        <div className="pay-scroll">
          <table className="ops-table wl-table">
            <thead>
              <tr><th scope="col">Person</th>{LINES.map((l) => <th key={l.key} scope="col">{l.label} sold</th>)}<th scope="col">Wildlife sold</th><th scope="col">Wildlife done</th></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.name}</th>
                  {LINES.map((l) => <td key={l.key}>{cell(sumBy(sold, p.id, l.key, 'cur'))}</td>)}
                  <td><b>{cell(sumBy(sold, p.id, null, 'cur'))}</b></td>
                  <td>{cell(sumBy(done, p.id, null, 'cur'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {officeKeys.length > 0 && (
        <>
          <h3 className="wl-sub">By customer’s office</h3>
          <div className="pay-scroll">
            <table className="ops-table wl-table">
              <thead>
                <tr><th scope="col">Office</th>{LINES.map((l) => <th key={l.key} scope="col">{l.label} sold</th>)}<th scope="col">Wildlife sold</th><th scope="col">Wildlife done</th></tr>
              </thead>
              <tbody>
                {officeKeys.map((k) => (
                  <tr key={k}>
                    <th scope="row">{OFFICE_NAME[k] || k}</th>
                    {LINES.map((l) => <td key={l.key}>{cell(sumBy(soldOff, null, l.key, 'cur', k))}</td>)}
                    <td><b>{cell(sumBy(soldOff, null, null, 'cur', k))}</b></td>
                    <td>{cell(sumBy(doneOff, null, null, 'cur', k))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="calc-hint">
        Office = the office of the customer who bought or was serviced.
        Sold counts jobs where they’re the sales rep in FieldRoutes (contract value); done counts completed visits they serviced (production value).
        Reservices aren’t counted: they’re unpaid return trips (they still show in the Reservices column below).
        {names.length > 0 && <> Counted service types: {names.join(', ')}.</>}
      </p>
    </section>
  );
}
