import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { DAY_NAMES, WEEK_ORDER, clock, roleTitle, shortDate } from '@/lib/labels';
import ProfileActions from './ProfileActions';
import SignOut from './SignOut';

export const dynamic = 'force-dynamic';

const APPS = {
  technician: { name: 'Technician scorecard', blurb: 'KPIs, incentives and the team leaderboard.' },
  sales: { name: 'Sales rep cards', blurb: 'Doors, sales and rep standings.' },
  operations: { name: 'Operations suite', blurb: 'Sales, cancels, job pool, reservice and AR for every office.' },
};

// How far the schedule arrows can go, in weeks from this week
const WEEKS_BACK = 4;
const WEEKS_AHEAD = 8;

/** Which suites each person sees, from the role map. */
function appsFor(department, level) {
  if (level === 'c_suite' || level === 'president') return ['technician', 'sales', 'operations'];
  if (level === 'team_member') return [department === 'administrative' ? 'operations' : department];
  if (department === 'sales') return ['sales', 'operations'];
  if (department === 'technician') return ['technician', 'sales', 'operations'];
  return ['operations', 'technician'];
}

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

  const hours = {};
  (schedule || []).forEach((d) => {
    if (d.start_time && d.end_time) hours[d.weekday] = `${clock(d.start_time)} – ${clock(d.end_time)}`;
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
    .select('start_date, end_date, status')
    .eq('employee_id', me.id)
    .in('status', ['pending', 'approved'])
    .lte('start_date', dates[0])
    .gte('end_date', dates[1]);
  function offStatus(ymd) {
    const hits = (timeOff || []).filter((r) => r.start_date <= ymd && r.end_date >= ymd);
    if (hits.some((r) => r.status === 'approved')) return 'approved';
    return hits.length ? 'pending' : null;
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
              const st = offStatus(dates[d]);
              const working = hours[d] && st !== 'approved';
              return (
                <li key={d} className={`day${working ? '' : ' off'}${week === 0 && d === today ? ' today' : ''}`}>
                  <span className="day-name">{DAY_NAMES[d]}, {shortDate(dates[d])}</span>
                  <span className="day-hours">
                    {st === 'approved' ? 'Time off'
                      : st === 'pending' ? `${hours[d] || 'Off'} (time off requested)`
                      : hours[d] || 'Off'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <ProfileActions employeeId={me.id} email={user.email} />

        <section className="section" aria-labelledby="apps-heading">
          <h2 id="apps-heading">Your apps</h2>
          <ul className="apps">
            {appsFor(me.department, me.level).map((key) => (
              <li key={key} className="app">
                <div>
                  <h3>{APPS[key].name}</h3>
                  <p>{APPS[key].blurb}</p>
                </div>
                <span className="soon">Moving here soon</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
