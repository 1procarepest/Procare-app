import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { sendEmail } from '@/lib/email';
import { OFFICE_NAME, roleTitle, timeOffWhen } from '@/lib/labels';

// Sends the automatic emails. The app calls this right after someone:
//   { event: 'time_off', id }          adds time off (request → HR; sales notice → sales manager)
//   { event: 'time_off_decided', id }  approves or denies a request (→ the employee)
//   { event: 'issue', id }             reports a schedule issue (switch schedule_issue) or a sales
//                                      schedule update (switch sales_schedule_change) → whoever handles their schedule
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
      const to = await others(await hrApprovers(), person.id);
      const { ok: sent, problem } = await sendEmail({
        to: to.map((p) => p.email),
        subject: `${r.use_pto ? 'PTO request' : 'Time-off request'}: ${name(person)}, ${when}`,
        heading: r.use_pto ? `${name(person)} is asking for paid time off` : `${name(person)} is asking for time off`,
        lines: [
          who(person),
          `When: ${when}`,
          `Paid time off (PTO): ${r.use_pto ? 'Yes, they want this paid' : 'No'}`,
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
        ...(r.use_pto ? ['You asked for this to be paid time off (PTO).'] : []),
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

  return reply(400, { message: 'Unknown event.' });
}
