import { GROUP_LABEL, commissionUpfront, money0, n, scaleFor, rateAt, termitePct } from './comp';

/**
 * The sales rep agreement (change 93), written from the rep's plan for the year so it always says what the app pays
 * (John, 2026-11-25: the app wins over old paperwork). Based on ProCare's First Year and Experienced Independent
 * Contractor Agreements, with John's changes: ProCare Sales, LLC; Jan 1–Dec 31 terms; no write-ups; bonuses forfeited
 * if ProCare ends the agreement; customer protection instead of a noncompete; an equipment exhibit (Exhibit E).
 *
 * Returns { title, kind, year, name, sections: [{ id, h, blocks }], hash }. blocks: { p } | { list } | { table: { head, rows } }.
 * The hash fingerprints the wording: when anything in it changes, the rep is asked to sign again.
 */

const PLAN_TITLE = {
  first_year: 'First Year Independent Contractor Agreement',
  experienced: 'Experienced Independent Contractor Agreement',
  flat: 'Flat Rate Independent Contractor Agreement',
  salary: 'Salary Independent Contractor Agreement',
};
const pct = (v) => `${Math.round(n(v) * 100) / 100}%`;
const upTo = (min) => '$' + (n(min) - 0.01).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lines = (text) => String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);
const longDate = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** A small, stable fingerprint (FNV-1a), the same in the browser and on the server. */
export function fingerprint(obj) {
  const str = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function payExhibit({ a, s, year, company }) {
  const blocks = [];
  const P = (p) => blocks.push({ p });
  const L = (list) => blocks.push({ list });
  P('Compensation is based on the Contractor’s production under the plan below, and not on a fixed hourly or other basis'
    + (a.plan === 'salary' ? ', except for the weekly salary described below.' : '.')
    + ` All pay is processed on Mondays and paid on Wednesdays. Pay is figured by ${company}’s pay system from these terms; each rep can see their own pay statement in the ProCare app.`);

  const termite = termitePct(s, a);
  const cancelRule = `A sale counts once its first service is done. A customer who cancels within ${n(s.clawback_days)} days of their first service earns no commission, and anything already paid on that customer is taken back from later pay, including in the following year (a “clawback”). A customer more than ${n(s.past_due_days)} days past due doesn’t count until they pay.`;

  if (a.plan === 'flat') {
    P('Flat rate plan. For each new customer whose first service is done, ProCare pays a set amount, in full, in the weekly pay processed the Monday after the week it was serviced:');
    L([
      `${GROUP_LABEL.pest}: ${money0(s.flat_pest)} per customer`,
      `${GROUP_LABEL.termite}: ${money0(s.flat_termite)} per customer${termite ? `, plus ${pct(termite)} of the installation (initial) price the customer pays` : ''}`,
      `${GROUP_LABEL.mosquito}: ${money0(s.flat_mosquito)} per customer`,
    ]);
    P('There are no quarterly bonuses, holdbacks or rate increases on the flat rate plan.');
  } else {
    const sc = scaleFor(s, a);
    const up = commissionUpfront(s, a);
    const ladder = [];
    for (let k = 0; k < 60; k += 1) {
      const at = k * sc.every;
      const r = rateAt(sc, at);
      if (k > 0 && r === ladder[ladder.length - 1].rate) break;
      ladder.push({ at, rate: r });
      if (r >= sc.max) break;
    }
    if (a.plan === 'salary') {
      const from = a.salary_from && String(a.salary_from).slice(0, 4) === String(year) ? longDate(String(a.salary_from).slice(0, 10)) : `January 1, ${year}`;
      P(`Salary plan. ProCare pays the Contractor a weekly salary of ${money0(a.salary)}, starting with the week of ${from}, processed each Monday and paid that Wednesday. The salary takes the place of up-front payments.`);
      P('The Contractor’s commission is figured exactly as on the commission plan below. Each quarter, ProCare pays a quarterly bonus equal to the commission earned so far this year, minus the salary paid so far this year, minus any quarterly bonuses already paid. If commission has not out-earned the salary, no bonus is paid that quarter, and ProCare and the Contractor will meet to discuss performance and whether the salary plan continues.');
    } else {
      P(`Up front. ProCare pays the Contractor ${money0(up)} for each new customer once their first service is done, in the weekly pay processed the Monday after the week it was serviced.`);
    }
    P(`General pest commission. The Contractor earns a percentage of each pest customer’s contract value (the initial price plus the first year of recurring service). The percentage starts at ${pct(sc.start)} and goes up ${pct(sc.step)} for every ${sc.every} customers serviced in the calendar year (every service type counts), up to ${pct(sc.max)}. Each increase applies to all of that year’s pest customers, and the count starts over each January 1.`);
    blocks.push({ table: { head: ['Customers serviced this year', 'Pest commission'], rows: ladder.map((l, i) => [ladder[i + 1] ? `${l.at}–${ladder[i + 1].at - 1}` : `${l.at}+`, pct(l.rate)]) } });
    const bonus = [...(s.bonus || [])].sort((x, y) => n(x.min) - n(y.min));
    if (bonus.length) {
      P('Higher-value contracts. A single pest customer whose contract value reaches one of these levels earns the higher of the rate below or the Contractor’s current rate:');
      blocks.push({ table: { head: ['Contract value', 'Commission'], rows: bonus.map((b, i) => [bonus[i + 1] ? `${money0(b.min)} – ${upTo(bonus[i + 1].min)}` : `${money0(b.min)} and up`, pct(b.rate)]) } });
    }
    P(`Termite and mosquito. A termite baiting system customer earns ${money0(up)}${termite ? ` plus ${pct(termite)} of the installation (initial) price the customer pays` : ''}; a mosquito customer (regular or green) earns ${money0(up)}. ${a.plan === 'salary' ? 'These count toward the quarterly bonus.' : 'This is paid up front and is the whole commission on those customers.'}`);
    P(a.plan === 'salary'
      ? `Quarterly bonuses are paid on the 20th of the month after each quarter: April 20, July 20, October 20 and January 20 of the next year. For the first three quarters, ${pct(s.hold_pct)} of the bonus is held back and paid with the January 20 bonus.`
      : `Quarterly bonuses are paid on the 20th of the month after each quarter: April 20, July 20, October 20 and January 20 of the next year. Each is the commission earned so far this year, minus up fronts and earlier quarterly bonuses. For the first three quarters, ${pct(s.hold_pct)} of the amount above the up fronts is held back for cancellations and paid with the January 20 bonus.`);
    P(cancelRule);
  }
  if (String(a.agreement_terms || '').trim()) {
    blocks.push({ h3: 'Special terms for this Contractor' });
    lines(a.agreement_terms).forEach((p) => P(p));
  }
  blocks.push({ h3: 'Pricing guidelines' });
  L(lines(s.__pricing));
  blocks.push({ h3: 'Expenses' });
  P('The Contractor is responsible for their own transportation, food, mobile phone service and other expenses of providing the Services.');
  return blocks;
}

/**
 * @param {object} o.rep   { name } the rep's first and last name
 * @param {object} o.plan  their comp_assignments row for the year
 * @param {object} o.settings comp_settings
 * @param {object} o.co    agreement_settings
 */
export function buildAgreement({ rep, plan: a, settings: s0, co, year }) {
  const s = { ...s0, __pricing: co.pricing };
  const kind = a.plan === 'flat' ? 'flat' : a.plan === 'salary' ? 'salary' : (a.scale === 'experienced' ? 'experienced' : 'first_year');
  const company = co.company || 'ProCare Sales, LLC';
  const name = rep.name;
  const term = `January 1, ${year} through December 31, ${year}`;
  const sections = [
    {
      id: 'parties', h: null, blocks: [{
        p: `This Independent Contractor Agreement (“Agreement”) is entered into for the term ${term}, by and between ${name} (“Contractor”) and ${company}, ${co.company_desc}, with a principal place of business at ${co.address} (“ProCare”). It takes effect on the later of January 1, ${year} and the date the Contractor signs it.`,
      }],
    },
    {
      id: 's1', h: '1. Services', blocks: [
        { p: '1.1 Nature of Services. Contractor will be a sales representative marketing pest control services for ProCare (the “Services”). The Services are described more fully in Exhibit A, as well as in verbal and written materials provided to the Contractor before and during the sales period. Written materials, training, scripts and other proprietary information ProCare provides are subject to the confidentiality terms in Exhibit C. Contractor agrees to perform the Services in a diligent and workmanlike manner and on the schedule described in Exhibit A. Contractor grants ProCare the right, but not the obligation, to use and to license others to use Contractor’s name, voice, signature, photograph, likeness and biographical information in connection with the Services.' },
        { p: '1.2 Relationship of the Parties. Contractor enters into this Agreement as, and shall continue to be, an independent contractor. All Services shall be performed only by Contractor. Contractor shall not look to ProCare as their employer, partner, agent or principal, and is not entitled to benefits given to ProCare’s employees, including disability insurance, vacation or sick pay. Contractor is responsible, at their own expense and in their own name, for unemployment, disability and other insurance, and for licenses and permits usual or necessary for the Services. ProCare does provide workers’ compensation insurance.' },
        { p: '1.3 Compensation. Contractor is paid for the Services as set out in Exhibit B. No other fees or expenses will be paid unless ProCare approves them in writing in advance. Contractor is solely responsible for all taxes on this compensation, including Social Security, disability, unemployment and other payroll-type taxes, and holds ProCare harmless from any claim arising from Contractor’s failure to meet these obligations.' },
      ],
    },
    {
      id: 's2', h: '2. Protection of ProCare’s Confidential Information', blocks: [
        { p: '2.1 Confidential Information. ProCare owns and may develop proprietary techniques, training materials, trade secrets and confidential information of great value to its business (“ProCare Information”), and will disclose ProCare Information to Contractor during the Services. ProCare Information includes information developed or learned by Contractor while performing the Services, is to be broadly defined, and includes all information that has or could have commercial value to ProCare or whose unauthorized disclosure could harm ProCare, whether or not ProCare identifies it as confidential. Contractor agrees to the Confidentiality, Non-Solicitation and Customer Protection terms in Exhibit C.' },
        { p: '2.2 Protection of ProCare Information. During and after the Services, Contractor will keep ProCare Information confidential and will not disclose or use it except as needed to perform the Services during the term. Contractor will not remove tangible or electronic copies of ProCare Information without ProCare’s prior written approval. This survives the end of this Agreement.' },
        { p: '2.3 ProCare Property. All materials furnished to Contractor by ProCare or developed in performing the Services, including documents, notes, lists and electronic files (the “Materials”), and all ProCare equipment described in Exhibit E, are ProCare’s property and must be returned promptly when ProCare asks and when this Agreement ends for any reason. Contractor receives no rights in the Materials or ProCare Information except as needed to perform the Services and will not disclose them to any third party.' },
      ],
    },
    {
      id: 's3', h: '3. Term and Termination', blocks: [
        { p: `3.1 Term. This Agreement runs from ${term}, unless ended sooner as allowed here (the “Term”). Either party may end it at any time, with or without cause, on 15 days’ written notice. If either party ends it, ProCare will pay Contractor for work performed up to the end date, under Exhibit B, except that bonuses are forfeited as described in Exhibit A. Section 2, Exhibit C and Exhibit E survive the end of this Agreement. This Agreement ends automatically on Contractor’s death, and ProCare will pay Contractor’s estate only the accrued but unpaid compensation as of that date.` },
        { p: '3.2 Final pay and ProCare equipment. Equipment that is not returned, or is returned damaged beyond normal wear, will be charged to the Contractor at its replacement value as described in Exhibit E, and may be deducted from final pay to the extent the law allows.' },
      ],
    },
    {
      id: 's4', h: '4. Additional Provisions', blocks: [
        { p: `4.1 Governing Law and Attorney’s Fees. This Agreement is governed by the laws of the State of Georgia, without regard to its choice of law principles. The parties consent to exclusive jurisdiction and venue in the federal and state courts sitting in ${co.county}. In any action to enforce or interpret this Agreement, the prevailing party may recover reasonable attorney’s fees, costs and expenses.` },
        { p: '4.2 Binding Effect. This Agreement binds and benefits the parties’ successors, executors, heirs, representatives, administrators and permitted assigns. Contractor may not assign this Agreement or subcontract or delegate the Services without ProCare’s prior written consent; any attempt to do so is void.' },
        { p: '4.3 Severability. If any provision is found invalid or unenforceable, the rest of this Agreement will be read to carry out the parties’ intent as closely as possible.' },
        { p: '4.4 Entire Agreement. This Agreement, including its Exhibits, is the entire agreement of the parties on its subject and replaces all prior agreements and understandings, written or oral.' },
        { p: '4.5 Injunctive Relief. Contractor agrees that a breach or threatened breach of this Agreement by Contractor would cause ProCare irreparable harm, and that ProCare is entitled to injunctive relief to enforce it.' },
        { p: '4.6 Contractor’s Remedy. Contractor’s remedy for any breach of this Agreement is solely in damages against ProCare. Contractor waives any right to injunctive or equitable relief against any third party with respect to a dispute under this Agreement.' },
        { p: '4.7 Amendment and Waivers. This Agreement may be amended, or a term waived, only in a writing signed by the party to be bound, including an electronic signature in the ProCare app. A waiver of one breach is not a waiver of any other, and not enforcing a provision is not a waiver of the right to enforce it later.' },
        { p: '4.8 Time. Contractor agrees that time is of the essence in this Agreement.' },
        { p: '4.9 Notices and Electronic Signatures. Notices under this Agreement must be in writing and are effective when delivered by email, through the ProCare app or by other written communication. The parties agree to sign this Agreement electronically, and an electronic signature has the same effect as a handwritten one.' },
        { p: 'CONTRACTOR HAS READ THIS AGREEMENT CAREFULLY AND UNDERSTANDS ITS TERMS.' },
      ],
    },
    {
      id: 'exA', h: 'Exhibit A · Description of Services and Work Schedule', blocks: [
        { p: 'Services to be provided by Contractor: sales representative for residential pest control services, including termite and mosquito services.' },
        { p: 'Work expectations:' },
        { list: lines(co.schedule) },
        { p: `Early termination. If the Contractor stops working before the end of the Term, or ProCare ends this Agreement for any reason, all quarterly bonuses and held-back amounts not yet paid on the end date are forfeited. Up fronts, salary and flat amounts already earned are paid as described in Exhibit B.` },
        { p: '“Cause” for ending this Agreement immediately includes any one or more of: (1) violating the ProCare Code of Conduct (Exhibit D); (2) theft; (3) harassment of any person; (4) conviction of a felony, misdemeanor or other criminal offense; (5) failure to perform stated duties; (6) violating ProCare’s drug and alcohol policy (ProCare is a drug-free company, may conduct random drug testing, and refusing a test results in immediate termination; anyone found distributing illegal drugs will be terminated immediately); (7) violating the equipment terms in Exhibit E; or (8) moving or helping move a ProCare customer to another provider (Exhibit C).' },
        { p: 'ProCare Information may be used at the Contractor’s residence, provided appropriate confidentiality procedures are followed.' },
        { p: 'Background check. ProCare may conduct a background check on all contractors. By signing, Contractor authorizes ProCare to use their Social Security number or other identifying information to obtain background information to assess their fitness to work as a contractor.' },
      ],
    },
    { id: 'exB', h: 'Exhibit B · Payment', blocks: payExhibit({ a, s, year, company }) },
    {
      id: 'exC', h: 'Exhibit C · Confidentiality, Non-Solicitation and Customer Protection', blocks: [
        { p: 'ProCare has engaged the Contractor on terms, including compensation, satisfactory to both, terminable at will by either party under the Agreement. In consideration of the mutual promises in the Agreement, the parties agree as follows:' },
        { p: '1. Confidential Information. Through this relationship Contractor will obtain access to ProCare’s confidential information (“Confidential Information”), including customer and prospect lists, customer pricing and service history, sales scripts, training, techniques, processes, marketing, financial and business information, and similar proprietary information, and any improvements to them. Confidential Information does not include information that (a) is public through no fault of Contractor; (b) Contractor can show it had before disclosure or developed independently; or (c) Contractor received from a third party with the legal right to share it. Confidential Information is a unique asset owned solely by ProCare.' },
        { p: '2. Non-Disclosure. Contractor will keep Confidential Information in confidence, will not disclose it to any third party without ProCare’s permission, will use it only to perform the Services, will return all copies when asked or when the relationship ends, and will honor these promises during and after the relationship. Contractor may disclose Confidential Information under a subpoena or court order if Contractor gives ProCare reasonable prior notice so ProCare can challenge it.' },
        { p: '3. Customer protection and non-solicitation. During the Term and for twenty-four (24) months after it ends, for any reason, Contractor will not, directly or indirectly, on their own behalf or for anyone else:' },
        {
          list: [
            'solicit, sell to, or service any ProCare customer (including any customer the Contractor sold for ProCare, and any customer the Contractor learned about through ProCare) for pest control, termite, mosquito or similar services offered by ProCare;',
            'encourage, help or arrange for any ProCare customer to cancel, not renew, or move their service to another provider, including by sharing customer names, addresses, pricing or service details;',
            'hire or engage, or help anyone else hire or engage, any person who works for ProCare or worked for ProCare when the Contractor left.',
          ],
        },
        { p: '4. Repayment for moved customers. ProCare pays commissions, up fronts and bonuses to build a lasting customer base. If a customer the Contractor sold cancels and the Contractor had any part in moving that customer to another provider, the Contractor will repay ProCare everything ProCare paid the Contractor on that customer (up fronts, commissions, bonuses and flat amounts), no matter how long ago it was paid. ProCare may deduct this from any amount it owes the Contractor, to the extent the law allows, and may recover the rest, together with its other damages.' },
        { p: '5. Non-Disparagement. After the relationship ends, neither party will make disparaging remarks about the other to ProCare’s employees, owners, customers, vendors, competitors or others with whom either has a business relationship.' },
        { p: '6. Remedies. The parties agree that money damages would not be enough for a breach of this Exhibit, that ProCare is entitled to injunctive relief without notice in addition to any other remedy, and that this Exhibit does not limit ProCare’s right to that relief.' },
      ],
    },
    {
      id: 'exD', h: 'Exhibit D · Code of Conduct', blocks: [
        { p: 'ProCare holds its employees and independent contractors to a high standard of ethical conduct. Unethical or dishonest sales practices are a breach of the code of conduct and may result in immediate termination and forfeiture of any bonuses and earned rate increases. Failing to tell a customer the price or length of the agreement (12 months), or failing to tell them about the follow-up treatment, is a breach of the code of conduct.' },
      ],
    },
    {
      id: 'exE', h: 'Exhibit E · ProCare Equipment', blocks: [
        { p: lines(co.equipment).join(' ') },
        {
          list: [
            'Contractor will use ProCare equipment only for ProCare work, keep it in good condition, and report any loss, theft or damage to their manager right away.',
            'Contractor will return all ProCare equipment within 3 days of when ProCare asks, and when this Agreement ends for any reason.',
            'Equipment not returned, or returned damaged beyond normal wear, is charged to the Contractor at its replacement or repair cost, and the Contractor authorizes ProCare to deduct that amount from their final pay to the extent the law allows.',
          ],
        },
      ],
    },
  ];
  const title = PLAN_TITLE[kind];
  const body = { title, kind, year, name, company, sections };
  // Who signs for ProCare isn't part of the wording, so changing it doesn't ask reps to sign again
  return { ...body, hash: fingerprint(body), signer: { name: co.signer_name, title: co.signer_title } };
}
