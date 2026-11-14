import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { DAY_NAMES, WEEK_ORDER, clock, fromMinutes, roleTitle, shortDate, toMinutes } from '@/lib/labels';
import { APPS, appsFor } from '@/lib/apps';
import ProfileActions from './ProfileActions';
import SignOut from './SignOut';

export const dynamic = 'force-dynamic';

// How far the schedule arrows can go, in weeks from this week
const WEEKS_BACK = 4;
const WEEKS_AHEAD = 8;

export default async function Home({ searchParams }) {
  const supabase = createClient();
  const { user, me } = await getMe(supabase);
  if (!user) redirect('/login');

  if (!me) {
    return (
      <main className="empty">
        <img src="/logo.png" alt="Procare" width="150" />
        <h1>Your account isn’t set up yet</h1>
        <p className="note">
          You’re signed in as {user.email}, but that email isn’t linked to an active employee.
          Ask your lead or manager to check your email in FieldRoutes.
        </p>
        <SignOut />
      </main>
    );
  }

  const { data: schedule } = await supabase
    .from('schedules')
    .select('weekday, start_time, end_time')
    .eq('employee_id', me.id);

  // Scheduled hours per weekday, in minutes from midnight
  const shifts = {};
  (schedule || []).forEach((d) => {
    if (d.start_time && d.end_time) shifts[d.weekday] = [toMinutes(d.start_time), toMinutes(d.end_time)];
  });

  const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/New_York' }).format(new Date());
  const today = DAY_NAMES.indexOf(todayName);
  // Which week to show: ?week=0 is this week, 1 is next week, -1 is last week
  const asked = parseInt(searchParams?.week, 10);
  const week = Number.isNaN(asked) ? 0 : Math.min(WEEKS_AHEAD, Math.max(-WEEKS_BACK, asked));
  const weekHref = (n) => (n === 0 ? '/' : `/?week=${n}`);

  // That week's dates (Monday first, Atlanta time) and any time off in them
  const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const base = new Date(`${todayYmd}T12:00:00Z`);
  const back = (base.getUTCDay() + 6) % 7 - week * 7;
  const dates = {};
  WEEK_ORDER.forEach((d, i) => {
    const dt = new Date(base);
    dt.setUTCDate(base.getUTCDate() - back + i);
    dates[d] = dt.toISOString().slice(0, 10);
  });
  const { data: timeOff } = await supabase
    .from('time_off_requests')
    .select('start_date, end_date, start_time, end_time, status')
    .eq('employee_id', me.id)
    .in('status', ['pending', 'approved'])
    .lte('start_date', dates[0])
    .gte('end_date', dates[1]);
  // What a day's row says. Approved time off is taken out of the scheduled hours
  // ("9 AM – 5 PM" when someone leaves at 5); requested time off is shown alongside.
  function dayInfo(d, ymd) {
    const shift = shifts[d];
    const hits = (timeOff || []).filter((r) => r.start_date <= ymd && r.end_date >= ymd);
    const approved = hits.filter((r) => r.status === 'approved');
    const pending = hits.filter((r) => r.status === 'pending');

    if (approved.some((r) => !r.start_time)) return { text: 'Time off', working: false };

    // Scheduled hours minus every approved part-day
    let pieces = shift ? [shift] : [];
    approved.forEach((r) => {
      const [a, b] = [toMinutes(r.start_time), toMinutes(r.end_time)];
      pieces = pieces.flatMap(([x, y]) => [[x, Math.min(y, a)], [Math.max(x, b), y]].filter(([p, q]) => q > p));
    });
    if (shift && pieces.length === 0) return { text: 'Time off', working: false };
    let text = pieces.length ? pieces.map(([x, y]) => `${clock(fromMinutes(x))} – ${clock(fromMinutes(y))}`).join(', ') : 'Off';

    const ask = pending.find((r) => !r.start_time) || pending[0];
    if (ask) {
      text += ask.start_time
        ? ` (requested off ${clock(ask.start_time)} – ${clock(ask.end_time)})`
        : ' (time off requested)';
    }
    return { text, working: pieces.length > 0 };
  }
  const initials = `${me.first_name?.[0] || ''}${me.last_name?.[0] || ''}`.toUpperCase();
  const hasPhoto = typeof me.photo_url === 'string' && me.photo_url.startsWith('http');
  const officeName = me.offices?.name;

  return (
    <>
      <header className="topbar">
        <img src="/logo.png" alt="Procare" />
        <div className="topbar-links">
          {me.rank >= 2 && <Link className="toplink" href="/admin">Manage team</Link>}
          <SignOut />
        </div>
      </header>

      <main className="home">
        <section className="hello">
          {hasPhoto
            ? <img className="avatar" src={me.photo_url} alt="" />
            : <div className="avatar" aria-hidden="true">{initials}</div>}
          <div>
            <h1>Happy {todayName}, {me.first_name}</h1>
            <p>{roleTitle(me.department, me.level)}{officeName ? `, ${officeName}` : ''}</p>
          </div>
        </section>

        <section className="section" aria-labelledby="week-heading">
          <div className="week-head">
            <h2 id="week-heading">Your schedule</h2>
            <nav className="week-nav" aria-label="Choose a week">
              {week > -WEEKS_BACK
                ? <Link className="week-arrow" href={weekHref(week - 1)} aria-label="Previous week" scroll={false}>‹</Link>
                : <span className="week-arrow" aria-hidden="true">‹</span>}
              {week === 0
                ? <span className="week-label">This week</span>
                : <Link className="week-label" href="/" scroll={false}>Week of {shortDate(dates[1])}</Link>}
              {week < WEEKS_AHEAD
                ? <Link className="week-arrow" href={weekHref(week + 1)} aria-label="Next week" scroll={false}>›</Link>
                : <span className="week-arrow" aria-hidden="true">›</span>}
            </nav>
          </div>
          <ul className="week">
            {WEEK_ORDER.map((d) => {
              const { text, working } = dayInfo(d, dates[d]);
              return (
                <li key={d} className={`day${working ? '' : ' off'}${week === 0 && d === today ? ' today' : ''}`}>
                  <span className="day-name">{DAY_NAMES[d]}, {shortDate(dates[d])}</span>
                  <span className="day-hours">{text}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <ProfileActions employeeId={me.id} email={user.email} isSales={me.department === 'sales'} />

        <section className="section" aria-labelledby="apps-heading">
          <h2 id="apps-heading">Your apps</h2>
          <ul className="apps">
            {appsFor(me.department, me.level).map((key) => (
              <li key={key}>
                {APPS[key].href ? (
                  <Link className="app app-link" href={APPS[key].href}>
                    <div>
                      <h3>{APPS[key].name}</h3>
                      <p>{APPS[key].blurb}</p>
                    </div>
                    <span className="open" aria-hidden="true">Open ›</span>
                  </Link>
                ) : (
                  <div className="app">
                    <div>
                      <h3>{APPS[key].name}</h3>
                      <p>{APPS[key].blurb}</p>
                    </div>
                    <span className="soon">Moving here soon</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
