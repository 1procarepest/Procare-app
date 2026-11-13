import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProfileActions from './ProfileActions';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

const LEVEL_LABEL = {
  team_member: 'Team member',
  lead: 'Lead',
  manager: 'Manager',
  c_suite: 'C-Suite',
  president: 'President',
};
const DEPT_LABEL = { technician: 'Technician', sales: 'Sales', administrative: 'Office' };

const APPS = {
  technician: { name: 'Technician scorecard', blurb: 'KPIs, incentives and the team leaderboard.' },
  sales: { name: 'Sales rep cards', blurb: 'Doors, sales and rep standings.' },
  operations: { name: 'Operations suite', blurb: 'Sales, cancels, job pool, reservice and AR for every office.' },
};

/** Which suites each person sees, from the role map. */
function appsFor(department, level) {
  if (level === 'c_suite' || level === 'president') return ['technician', 'sales', 'operations'];
  if (level === 'team_member') return [department === 'administrative' ? 'operations' : department];
  if (department === 'sales') return ['sales', 'operations'];
  if (department === 'technician') return ['technician', 'sales', 'operations'];
  return ['operations', 'technician'];
}

/** "09:00:00" → "9 AM", "13:30:00" → "1:30 PM" */
function clock(t) {
  const [h, m] = String(t).split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button className="signout" type="submit">Sign out</button>
    </form>
  );
}

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('employees')
    .select('id, first_name, last_name, photo_url, office, department, level, offices(name)')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle();

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

  const initials = `${me.first_name?.[0] || ''}${me.last_name?.[0] || ''}`.toUpperCase();
  const hasPhoto = typeof me.photo_url === 'string' && me.photo_url.startsWith('http');
       const role = ['c_suite', 'president'].includes(me.level)
       ? LEVEL_LABEL[me.level]
       : `${DEPT_LABEL[me.department] || ''} ${LEVEL_LABEL[me.level] || ''}`.trim();
  const officeName = me.offices?.name;

  return (
    <>
      <header className="topbar">
        <img src="/logo.png" alt="Procare" />
        <SignOut />
      </header>

      <main className="home">
        <section className="hello">
          {hasPhoto
            ? <img className="avatar" src={me.photo_url} alt="" />
            : <div className="avatar" aria-hidden="true">{initials}</div>}
          <div>
            <h1>Happy {todayName}, {me.first_name}</h1>
            <p>{role}{officeName ? `, ${officeName}` : ''}</p>
          </div>
        </section>

        <section className="section" aria-labelledby="week-heading">
          <h2 id="week-heading">Your schedule</h2>
          <ul className="week">
            {WEEK_ORDER.map((d) => (
              <li key={d} className={`day${hours[d] ? '' : ' off'}${d === today ? ' today' : ''}`}>
                <span className="day-name">{DAY_NAMES[d]}</span>
                <span className="day-hours">{hours[d] || 'Off'}</span>
              </li>
            ))}
          </ul>
        </section>

        <ProfileActions employeeId={me.id} canRequestTimeOff={me.department !== 'sales'} />

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
