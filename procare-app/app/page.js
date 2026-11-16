import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/me';
import { DAY_NAMES, WEEK_ORDER, clock, fromMinutes, roleTitle, shortDate, toMinutes } from '@/lib/labels';
import { APPS, appsFor } from '@/lib/apps';
import { photoSrc } from '@/lib/photo';
import ProfileActions from './ProfileActions';
import { BugTile } from './Bug';
import TodayRoute from './TodayRoute';
import RepCard from './reps/RepCard';
import { buildCards, measure, periodRange, todayYmd as atlantaToday } from '@/lib/repcards';
import SignOut from './SignOut';
import TopNav from './TopNav';
import Earnings from './Earnings';
import { settleCompetitions } from '@/lib/awards';
import { money, money0, nextMonday, nice, statement } from '@/lib/comp';

export const dynamic = 'force-dynamic';

// How far the schedule arrows can go, in weeks from this week
const WEEKS_BACK = 4;
const WEEKS_AHEAD = 8;
// How far the route arrows can go, in days from today
const ROUTE_DAYS = 7;

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

  // Competition prizes: pay out anything that just finished, then this person's earnings
  await settleCompetitions(supabase, atlantaToday());
  const [{ data: awards }, { data: payouts }] = await Promise.all([
    supabase.from('competition_awards').select('id, amount, reason, payout_id, created_at').eq('employee_id', me.id).order('created_at', { ascending: false }),
    supabase.from('payout_requests').select('id, amount, status, requested_at, paid_at').eq('employee_id', me.id).order('requested_at', { ascending: false }),
  ]);

  // Route day: ?day=0 is today, 1 tomorrow, -1 yesterday (7 days either way)
  const askedDay = parseInt(searchParams?.day, 10);
  const dayOffset = Number.isNaN(askedDay) ? 0 : Math.min(ROUTE_DAYS, Math.max(-ROUTE_DAYS, askedDay));
  const routeDate = new Date(Date.now() + dayOffset * 86400000);
  const routeDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(routeDate);
  const { data: route } = me.department === 'technician'
    ? await supabase.rpc('my_route', { p_day: routeDay })
    : { data: null };

  // Sales reps: their own Rep Card for this week
  let myCard = null;
  if (me.department === 'sales') {
    const wk = periodRange('week', atlantaToday());
    const { data: rows } = await supabase.rpc('rep_cards', { p_from: wk.from, p_to: wk.to });
    const { reps } = buildCards(rows, wk.to);
    myCard = reps.find((r) => r.id === me.id) || {
      id: me.id, first_name: me.first_name, last_name: me.last_name, name: `${me.first_name} ${me.last_name}`,
      office: me.office, photo: me.photo_url, m: measure({}), weeks: [],
    };
  }

  // Sales reps: pay at a glance (shadow mode)
  let myPay = null;
  if (me.department === 'sales') {
    const today = atlantaToday();
    const { data: comp } = await supabase.rpc('comp_sales', { p_year: Number(today.slice(0, 4)), p_emp: me.id });
    if (comp) {
      const st = statement(comp, me.id, Number(today.slice(0, 4)), today);
      const monday = nextMonday(today);
      const q = st.quarters.find((x) => x.payDate > today);
      myPay = { st, monday, week: st.weeks.find((w) => w.payday === monday), q };
    }
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
  const weekHref = (n) => {
    const q = [n ? `week=${n}` : '', dayOffset ? `day=${dayOffset}` : ''].filter(Boolean).join('&');
    return q ? `/?${q}` : '/';
  };
  const dayHref = (n) => {
    const q = [week ? `week=${week}` : '', n ? `day=${n}` : ''].filter(Boolean).join('&');
    return q ? `/?${q}` : '/';
  };

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
  const photo = photoSrc(me.photo_url);
  const officeName = me.offices?.name;

  return (
    <>
      <TopNav me={me} supabase={supabase} current="home" />

      <main className="home">
        <section className="hello bug-band">
          {photo
            ? <img className="avatar" src={photo} alt="" />
            : <div className="avatar" aria-hidden="true">{initials}</div>}
          <div>
            <h1>Happy {todayName}, {me.first_name}</h1>
            <p>{roleTitle(me.department, me.level)}{officeName ? `, ${officeName}` : ''}</p>
          </div>
        </section>

        {(awards || []).length > 0 && <Earnings awards={awards} requests={payouts || []} />}

        {myCard && (
          <section className="section my-card" aria-labelledby="card-heading">
            <div className="my-card-head">
              <h2 id="card-heading">Your card this week</h2>
              <Link href="/reps">All rep cards ›</Link>
            </div>
            <RepCard rep={myCard} me showWeeks={false} />
          </section>
        )}

        {myPay && (
          <section className="section my-pay" aria-labelledby="pay-heading">
            <div className="my-card-head">
              <h2 id="pay-heading">Your pay</h2>
              <Link href="/pay">Statement and calculator ›</Link>
            </div>
            {myPay.st.plan ? (
              <div className="my-pay-box">
                <div><small>Monday, {nice(myPay.monday)}</small><strong>{money(myPay.week?.total || 0)}</strong><small>{myPay.week?.sales.length || 0} serviced last week</small></div>
                {myPay.q
                  ? <div><small>Q{myPay.q.q} check, {nice(myPay.q.payDate)}</small><strong>{money0(myPay.q.paidOut)}</strong><small>{myPay.q.rate}% · so far</small></div>
                  : <div><small>Up front this year</small><strong>{money0(myPay.st.upfrontYtd)}</strong><small>flat rate plan</small></div>}
              </div>
            ) : <p className="note">Your pay plan isn’t set up in the app yet. Try the <Link href="/pay?tab=calc">pay calculator</Link>.</p>}
          </section>
        )}

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

        {route && <TodayRoute jobs={route} offset={dayOffset} day={routeDay} links={{
          prev: dayOffset > -ROUTE_DAYS ? dayHref(dayOffset - 1) : null,
          next: dayOffset < ROUTE_DAYS ? dayHref(dayOffset + 1) : null,
          today: dayHref(0),
        }} />}


        <section className="section" aria-labelledby="apps-heading">
          <h2 id="apps-heading">Your apps</h2>
          <ul className="apps">
            {appsFor(me.department, me.level).map((key) => (
              <li key={key}>
                {APPS[key].href ? (
                  <Link className="app app-link" href={APPS[key].href}>
                    <BugTile kind={APPS[key].bug} tone={APPS[key].tone} />
                    <div className="app-text">
                      <h3>{APPS[key].name}</h3>
                      <p>{APPS[key].blurb}</p>
                    </div>
                    <span className="open" aria-hidden="true">Open ›</span>
                  </Link>
                ) : (
                  <div className="app">
                    <BugTile kind={APPS[key].bug} tone={APPS[key].tone} />
                    <div className="app-text">
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
