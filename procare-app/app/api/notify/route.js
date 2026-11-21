import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { sendEmail } from '@/lib/email';
import { OFFICE_NAME, roleTitle, timeOffWhen } from '@/lib/labels';
import { EXPERIENCE, KIND_LABEL, SKILL_LABEL, answerLines, lowScore } from '@/lib/reports';
import { FORM_DAYS, dayLine } from '@/lib/availability';

// Sends the automatic emails. The app calls this right after someone:
//   { event: 'time_off', id }          adds time off (request → HR; sales notice → sales manager)
//   { event: 'time_off_decided', id }  approves or denies a request (→ the employee)
//   { event: 'issue', id }             reports a schedule issue (switch schedule_issue) or a sales
//                                      schedule update (switch sales_schedule_change) → whoever handles their schedule
//   { event: 'field_report', id }      files a ride-along or follow-behind (→ report recipients; truck items and
//                                      Upset / Let down customers → the office's branch managers)
//   { event: 'bonus_entry', id }       logs bonus proof (→ the HR approver to approve it)
//   { event: 'availability', id }      fills out the availability form (switch availability_form → the HR approver, Ally)
// Each email has a switch on Settings → Email settings (notification_settings.key).
// People can only trigger emails about their own action, and only within a few minutes of it.

const RECENT_MS = 10 * 60 * 1000;
const PEOPLE = 'id, email, first_name, last_name, department, level, office, hr_approver, active';

function reply(status, body) {
  return NextResponse.json(body, { status });
}

function recent(ts) {
  return ts && Date.now() - new Date(ts).getTime() < RECENT_MS;
}

function name(p) {
  return `${p.first_name} ${p.last_name}`.trim();
}

function who(p) {
  return `${name(p)}, ${roleTitle(p.department, p.level)}${p.office ? `, ${OFFICE_NAME[p.office] || p.office}` : ''}`;
}

export async function POST(request) {
  const { event, id } = await request.json().catch(() => ({}));
  if (!event || !id) return reply(400, { message: 'Missing event or id.' });

  const supabase = createClient();
  const { me } = await getMe(supabase);
  if (!me) return reply(401, { message: 'Sign in again.' });

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return reply(500, { message: 'SUPABASE_SECRET_KEY is missing.' });
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const origin = new URL(request.url).origin;

  async function switchedOn(key) {
    const { data } = await admin.from('notification_settings').select('enabled').eq('key', key).maybeSingle();
    return !!data?.enabled;
  }

  async function people(filter) {
    let q = admin.from('employees').select(PEOPLE).eq('active', true);
    q = filter(q);
    const { data } = await q;
    return data || [];
  }
  const presidents = () => people((q) => q.eq('level', 'president'));
  const salesManagers = () => people((q) => q.eq('department', 'sales').eq('level', 'manager'));
  const hrApprovers = () => people((q) => q.eq('hr_approver', true));
  // The wildlife team's schedule and time off go to the wildlife manager (Jessica, change 79); HR if there is none
  const wildlifeManagers = async () => {
    const list = await people((q) => q.eq('manages_wildlife', true));
    return list.length ? list : hrApprovers();
  };

  // Everyone in `list` except the person themselves; falls back to the President.
  async function others(list, personId) {
    const picked = list.filter((p) => p.id !== personId);
    return picked.length ? picked : (await presidents()).filter((p) => p.id !== personId);
  }

  async function employee(empId) {
    const { data } = await admin.from('employees').select(PEOPLE).eq('id', empId).maybeSingle();
    return data;
  }

  // ---------- Test email (Email settings page, C-Suite and up) ----------
  if (event === 'test') {
    if (me.rank < 4) return reply(403, { message: 'Only C-Suite can send a test email.' });
    const self = await employee(me.id);
    const { ok: sent, problem } = await sendEmail({
      to: [self?.email],
      subject: 'Test email from the Procare Team app',
      heading: 'Emails are working',
      lines: [
        `This test went to ${self?.email}.`,
        `It was sent from: ${process.env.EMAIL_FROM}`,
        `Replies go to: ${process.env.EMAIL_REPLY_TO || 'the sender above'}`,
      ],
      link: { href: `${origin}/admin/notifications`, label: 'Email settings' },
    });
    return reply(200, { sent, problem, to: self?.email, from: process.env.EMAIL_FROM || null, replyTo: process.env.EMAIL_REPLY_TO || null });
  }

  // ---------- Time off added ----------
  if (event === 'time_off' || event === 'time_off_decided') {
    const { data: r } = await admin
      .from('time_off_requests')
      .select('id, employee_id, start_date, end_date, start_time, end_time, use_pto, note, status, decision_note, decided_by, decided_at, created_at')
      .eq('id', id)
      .maybeSingle();
    if (!r) return reply(404, { message: 'Request not found.' });
    const person = await employee(r.employee_id);
    if (!person) return reply(404, { message: 'Employee not found.' });
    const when = timeOffWhen(r);

    if (event === 'time_off') {
      if (r.employee_id !== me.id || !recent(r.created_at)) return reply(403, { message: 'Not your recent request.' });

      if (person.department === 'sales') {
        if (!(await switchedOn('sales_time_off_notice'))) return reply(200, { sent: false });
        const to = await others(await salesManagers(), person.id);
        const { ok: sent, problem } = await sendEmail({
          to: to.map((p) => p.email),
          subject: `Time-off notice: ${name(person)}, ${when}`,
          heading: `${name(person)} is taking time off`,
          lines: [who(person), `When: ${when}`, ...(r.note ? [`Note: ${r.note}`] : []), 'Sales reps are 1099, so this is a notice. It’s already on their schedule; there’s nothing to approve.'],
          link: { href: `${origin}/admin/people/${person.id}`, label: 'See their schedule' },
        });
        return reply(200, { sent, problem });
      }

      if (!(await switchedOn('time_off_request'))) return reply(200, { sent: false });
      const to = await others(person.department === 'wildlife' ? await wildlifeManagers() : await hrApprovers(), person.id);
      const { ok: sent, problem } = await sendEmail({
        to: to.map((p) => p.email),
        subject: `${r.use_pto ? 'Paid vacation request' : 'Time-off request'}: ${name(person)}, ${when}`,
        heading: r.use_pto ? `${name(person)} is asking for paid vacation time` : `${name(person)} is asking for time off`,
        lines: [
          who(person),
          `When: ${when}`,
          `Paid vacation time: ${r.use_pto ? 'Yes, they want this paid' : 'No'}`,
          ...(r.note ? [`Note: ${r.note}`] : []),
        ],
        link: { href: `${origin}/admin/time-off`, label: 'Approve or deny' },
      });
      return reply(200, { sent, problem });
    }

    // ---------- Time off decided ----------
    if (r.decided_by !== me.id || !recent(r.decided_at) || !['approved', 'denied'].includes(r.status)) {
      return reply(403, { message: 'Not your recent decision.' });
    }
    if (r.employee_id === me.id) return reply(200, { sent: false }); // no email to yourself
    if (!(await switchedOn('time_off_decision'))) return reply(200, { sent: false });
    const approved = r.status === 'approved';
    const { ok: sent, problem } = await sendEmail({
      to: [person.email],
      subject: `Your time off for ${when} was ${approved ? 'approved' : 'denied'}`,
      heading: approved ? 'Your time off is approved' : 'Your time-off request was denied',
      lines: [
        `When: ${when}`,
        ...(r.use_pto ? ['You asked for this to be paid vacation time.'] : []),
        ...(r.decision_note ? [`Reply from ${name(me)}: ${r.decision_note}`] : [`Decided by ${name(me)}.`]),
        approved ? 'It’s on your schedule in the app.' : 'If you have questions, talk with your manager or HR.',
      ],
      link: { href: `${origin}/`, label: 'Open your schedule' },
    });
    return reply(200, { sent, problem });
  }

  // ---------- Schedule issue or update ----------
  if (event === 'issue') {
    const { data: issue } = await admin
      .from('schedule_issue_reports')
      .select('id, employee_id, message, created_at')
      .eq('id', id)
      .maybeSingle();
    if (!issue) return reply(404, { message: 'Issue not found.' });
    if (issue.employee_id !== me.id || !recent(issue.created_at)) return reply(403, { message: 'Not your recent report.' });
    const person = await employee(issue.employee_id);
    if (!person) return reply(404, { message: 'Employee not found.' });
    if (!(await switchedOn(person.department === 'sales' ? 'sales_schedule_change' : 'schedule_issue'))) {
      return reply(200, { sent: false });
    }

    // Whoever handles their schedule (same as can_edit_schedule / can_manage in the database)
    let handlers;
    if (person.department === 'sales') {
      handlers = await salesManagers();
    } else if (person.department === 'wildlife') {
      handlers = await wildlifeManagers();
    } else {
      const sameDept = await people((q) => q.eq('department', person.department).in('level', ['lead', 'manager']));
      handlers = sameDept.filter((m) =>
        (m.level === 'manager' && ['team_member', 'lead'].includes(person.level))
        || (m.level === 'lead' && m.office === person.office && person.level === 'team_member'));
    }
    const to = await others(handlers, person.id);
    const isSales = person.department === 'sales';
    const { ok: sent, problem } = await sendEmail({
      to: to.map((p) => p.email),
      subject: `${isSales ? 'Schedule update' : 'Schedule issue'} from ${name(person)}`,
      heading: isSales ? `${name(person)} sent a schedule update` : `${name(person)} reported a schedule issue`,
      lines: [who(person), `“${issue.message}”`, 'Update their schedule on their page, then mark it resolved under Schedule issues.'],
      link: { href: `${origin}/admin/people/${person.id}`, label: 'Open their schedule' },
    });
    return reply(200, { sent, problem });
  }

  // ---------- Availability form → HR approver (Ally) to update the schedule ----------
  if (event === 'availability') {
    const { data: f } = await admin.from('availability_forms')
      .select('id, employee_id, location, position, days, notes, signature, submitted_at').eq('id', id).maybeSingle();
    if (!f) return reply(404, { message: 'Form not found.' });
    if (f.employee_id !== me.id || !recent(f.submitted_at)) return reply(403, { message: 'Not your recent form.' });
    const person = await employee(f.employee_id);
    if (!person) return reply(404, { message: 'Employee not found.' });
    if (!(await switchedOn('availability_form'))) return reply(200, { sent: false });
    // Sales reps are contractors: their schedule already updated; the sales managers and the President get a note.
    // Everyone else: Ally (HR approver) approves it and fills in the schedule.
    const isSales = person.department === 'sales';
    const to = isSales
      ? [...await salesManagers(), ...await presidents()].filter((p, i, all) => p.id !== person.id && all.findIndex((x) => x.id === p.id) === i)
      : await others(person.department === 'wildlife' ? await wildlifeManagers() : await hrApprovers(), person.id);
    const days = [
      `Location: ${f.location || '–'} · Position: ${f.position || '–'}`,
      ...FORM_DAYS.map((d) => dayLine(f.days, d)),
      ...(f.notes ? [`Notes: “${f.notes}”`] : []),
      `Signed: ${f.signature}`,
    ];
    const { ok: sent, problem } = await sendEmail({
      to: to.map((p) => p.email),
      subject: isSales ? `Contractor availability updated: ${name(person)}` : `Availability form to approve: ${name(person)}`,
      heading: isSales ? `${name(person)} updated their availability` : `${name(person)} sent a new availability form`,
      lines: isSales
        ? [`${name(person)}, Sales rep (contractor)${person.office ? `, ${OFFICE_NAME[person.office] || person.office}` : ''}`, ...days,
          'Their schedule in the app is already updated. Nothing to approve.']
        : [who(person), ...days, 'Open their page, click “Fill in from this form”, check the hours and save to approve it.'],
      link: isSales ? { href: `${origin}/team`, label: 'Open the schedule' } : { href: `${origin}/admin/people/${person.id}`, label: 'Open their schedule' },
    });
    return reply(200, { sent, problem });
  }

  // ---------- Competition prize cash out → HR approver (Ally); paid → the employee ----------
  if (event === 'payout_request' || event === 'payout_paid') {
    const { data: r } = await admin.from('payout_requests')
      .select('id, employee_id, amount, status, requested_at, paid_at, paid_by, note').eq('id', id).maybeSingle();
    if (!r) return reply(404, { message: 'Payout not found.' });
    const person = await employee(r.employee_id);
    if (!person) return reply(404, { message: 'Employee not found.' });
    const amount = `$${Number(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const { data: items } = await admin.from('competition_awards').select('reason, amount').eq('payout_id', r.id);
    const list = (items || []).map((a) => `${a.reason}: $${Number(a.amount).toFixed(2)}`);

    if (event === 'payout_request') {
      if (r.employee_id !== me.id || !recent(r.requested_at)) return reply(403, { message: 'Not your recent cash out.' });
      if (!(await switchedOn('payout_request'))) return reply(200, { sent: false });
      const to = await others(await hrApprovers(), person.id);
      const { ok: sent, problem } = await sendEmail({
        to: to.map((p) => p.email),
        subject: `Cash out: ${name(person)}, ${amount}`,
        heading: `${name(person)} cashed out ${amount} in prizes and bonuses`,
        lines: [who(person), ...list,
          person.department === 'sales' ? 'Sales rep: pay it the way you do today (Everee later).' : 'Enter it in ADP, then mark it paid in the app.'],
        link: { href: `${origin}/admin/payouts`, label: 'Open prize payouts' },
      });
      return reply(200, { sent, problem });
    }

    // paid
    if (r.status !== 'paid' || r.paid_by !== me.id || !recent(r.paid_at)) return reply(403, { message: 'Not your recent payment.' });
    if (r.employee_id === me.id) return reply(200, { sent: false });
    if (!(await switchedOn('payout_paid'))) return reply(200, { sent: false });
    const { ok: sent, problem } = await sendEmail({
      to: [person.email],
      subject: `Your ${amount} payout has been submitted`,
      heading: `Nice work, ${person.first_name}! Your ${amount} is on its way`,
      lines: ['Your prize and bonus money was submitted to payroll.', ...list, ...(r.note ? [`Note: ${r.note}`] : [])],
      link: { href: `${origin}/`, label: 'See your earnings' },
    });
    return reply(200, { sent, problem });
  }

  // ---------- Ride-along or follow-behind → report recipients (Ryan); truck items and low scores → branch managers ----------
  if (event === 'field_report') {
    const { data: r } = await admin.from('field_reports').select('*').eq('id', id).maybeSingle();
    if (!r) return reply(404, { message: 'Report not found.' });
    if (r.author_id !== me.id || !recent(r.created_at)) return reply(403, { message: 'Not your recent report.' });
    const [tech, author, { data: settings }, { data: truck }] = await Promise.all([
      employee(r.tech_id), employee(r.author_id),
      admin.from('bonus_settings').select('report_to').eq('id', 1).maybeSingle(),
      admin.from('truck_issues').select('item').eq('report_id', r.id),
    ]);
    const kind = KIND_LABEL[r.kind];
    const techName = tech ? name(tech) : 'a tech';
    const where = r.office ? OFFICE_NAME[r.office] || r.office : '';
    const link = { href: `${origin}/reports/${r.id}`, label: 'Open the report' };
    const results = [];
    // The office's branch managers (technician managers in the tech's office), or the President if there are none
    const branch = async () => others(await people((q) => q.eq('department', 'technician').eq('level', 'manager').eq('office', r.office || '')), r.author_id);

    if (await switchedOn('field_report')) {
      const to = (settings?.report_to || []).length ? await people((q) => q.in('id', settings.report_to)) : [];
      if (to.length) {
        results.push(await sendEmail({
          to: to.map((p) => p.email),
          subject: `${kind}: ${techName}${where ? `, ${where}` : ''} (${r.day})`,
          heading: `${author ? name(author) : 'A manager'} filed a ${kind.toLowerCase()} for ${techName}`,
          lines: [
            ...(r.customer ? [`Customer: ${r.customer}`] : []),
            ...answerLines(r.kind, r.answers).map(([q, v]) => `${q}: ${v}`),
            ...(r.improve?.length ? [`Where to improve: ${r.improve.map((k) => SKILL_LABEL[k] || k).join(', ')}`] : []),
            ...(r.tech_praise ? [`What they did well (the tech sees this): ${r.tech_praise}`] : []),
            ...(r.tech_note ? [`What to work on (the tech sees this): ${r.tech_note}`] : []),
            r.told_tech ? 'The manager told the tech.' : 'The manager hasn’t told the tech yet, so this doesn’t count toward their bonus.',
          ],
          link,
        }));
      }
    }
    if ((truck || []).length && (await switchedOn('truck_issue'))) {
      const to = await branch();
      results.push(await sendEmail({
        to: to.map((p) => p.email),
        subject: `Truck needs attention: ${techName}`,
        heading: `${techName}’s truck needs attention`,
        lines: [...truck.map((t) => `• ${t.item}`), `Found on a ride-along by ${author ? name(author) : 'a manager'} on ${r.day}.`,
          `${tech?.first_name || 'The tech'} sees this on their home page. Switch it to Fixed in the app once it’s done.`],
        link: { href: `${origin}/reports?office=${r.office || ''}`, label: 'Open truck items' },
      }));
    }
    if (r.kind === 'follow_behind' && lowScore(r.answers) && (await switchedOn('low_score'))) {
      const to = await branch();
      const exp = EXPERIENCE.find((x) => x.v === Number(r.answers.experience));
      results.push(await sendEmail({
        to: to.map((p) => p.email),
        subject: `Customer ${exp?.label.toLowerCase() || 'unhappy'}: ${r.customer || 'follow-behind'} (${techName})`,
        heading: `A customer is ${exp?.label.toLowerCase() || 'unhappy'}. Reach out before they cancel`,
        lines: [
          `Customer: ${r.customer || '–'}`, `Tech: ${techName}${where ? `, ${where}` : ''}`,
          `Overall experience: ${exp ? `${exp.emoji} ${exp.label}` : r.answers.experience}`,
          ...(r.answers.negative ? [`What they said: ${r.answers.negative}`] : []),
          ...(r.answers.wish ? [`They’d like to see: ${r.answers.wish}`] : []),
          `Follow-behind by ${author ? name(author) : 'a manager'} on ${r.day}.`,
        ],
        link,
      }));
    }
    const failed = results.find((x) => !x.ok);
    return reply(200, { sent: results.some((x) => x.ok), problem: failed?.problem || null });
  }

  // ---------- Bonus proof logged → HR approver (Ally) ----------
  if (event === 'bonus_entry') {
    const { data: e } = await admin.from('bonus_entries').select('id, goal_id, employee_id, day, qty, link, note, created_at, bonus_goals(label, kind)').eq('id', id).maybeSingle();
    if (!e) return reply(404, { message: 'Entry not found.' });
    if (e.employee_id !== me.id || !recent(e.created_at)) return reply(403, { message: 'Not your recent entry.' });
    if (!(await switchedOn('bonus_entry'))) return reply(200, { sent: false });
    const person = await employee(e.employee_id);
    const to = await others(await hrApprovers(), e.employee_id);
    const { ok: sent, problem } = await sendEmail({
      to: to.map((p) => p.email),
      subject: `Bonus proof to approve: ${name(person)}, ${e.bonus_goals?.label || 'goal'}`,
      heading: `${name(person)} logged proof for “${e.bonus_goals?.label || 'a goal'}”`,
      lines: [
        `Date: ${e.day}`,
        `${e.bonus_goals?.kind === 'cost_per_customer' ? 'Ad spend' : 'Amount'}: ${e.bonus_goals?.kind === 'cost_per_customer' ? `$${Number(e.qty).toFixed(2)}` : e.qty}`,
        ...(e.link ? [`Proof: ${e.link}`] : []), ...(e.note ? [`Note: ${e.note}`] : []),
        'It counts toward their bonus once you approve it.',
      ],
      link: { href: `${origin}/bonus/manage?tab=approve`, label: 'Approve or turn down' },
    });
    return reply(200, { sent, problem });
  }

  return reply(400, { message: 'Unknown event.' });
}
