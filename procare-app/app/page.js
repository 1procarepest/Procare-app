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
import { myLiveCompetitions } from '@/lib/myCompetitions';
import { buildOps, buildSnapshot, opsRange } from '@/lib/ops';
import OfficeKpis from './OfficeKpis';
import MyCompetitions from './MyCompetitions';
import MyFeedback from './MyFeedback';
import Outbox from './reports/Outbox';
import { money, money0, nextMonday, nice, statement } from '@/lib/comp';
import { usualShift } from '@/lib/schedules';
import { followsHolidays, holidayLookup } from '@/lib/holidays';

export const dynamic = 'force-dynamic';

// How far the schedule arrows can go, in weeks from this week
const WEEKS_BACK = 4;
const WEEKS_AHEAD = 8;
// ...and in months, when showing the whole month
const MONTHS_BACK = 1;
const MONTHS_AHEAD = 2;
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

  // Speed: every lookup below starts now, all at once, and each is awaited where it's used
  // (they used to run one after another). `start` kicks off a Supabase query without waiting for it.
  const start = (q) => Promise.resolve(q);
  const none = Promise.resolve({ data: null });
  const isTech = me.department === 'technician';
  const isSales = me.department === 'sales';
  // Office staff: their office's numbers this month (same data as the Operations card)
  const isOffice = me.department === 'administrative';
  const month = opsRange('month', atlantaToday(), atlantaToday());
  // Route day: ?day=0 is today, 1 tomorrow, -1 yesterday (7 days either way)
  const askedDay = parseInt(searchParams?.day, 10);
  const dayOffset = Number.isNaN(askedDay) ? 0 : Math.min(ROUTE_DAYS, Math.max(-ROUTE_DAYS, askedDay));
  const routeDate = new Date(Date.now() + dayOffset * 86400000);
  const routeDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(routeDate);
  const salesWeek = periodRange('week', atlantaToday());
  const salesYear = Number(atlantaToday().slice(0, 4));
  // Competition prizes: pay out anything that just finished first, then this person's earnings
  const pEarnings = settleCompetitions(supabase, atlantaToday()).then(() => Promise.all([
    supabase.from('competition_awards').select('id, amount, reason, payout_id, created_at').eq('employee_id', me.id).order('created_at', { ascending: false }),
    supabase.from('payout_requests').select('id, amount, status, requested_at, paid_at').eq('employee_id', me.id).order('requested_at', { ascending: false }),
  ]));
  const pRest = Promise.all([
    myLiveCompetitions(supabase, me, atlantaToday()),
    isOffice ? start(supabase.rpc('ops_suite', { p_from: month.from, p_to: month.to, p_cfrom: month.cFrom, p_cto: month.cTo })) : none,
    isOffice ? start(supabase.rpc('ops_snapshot')) : none,
  ]);
  // Technicians: feedback from ride-alongs and follow-behinds, and their route
  const pFeedback = isTech ? start(supabase.rpc('my_feedback')) : none;
  const pRoute = isTech ? start(supabase.rpc('my_route', { p_day: routeDay })) : none;
  // Sales reps: this week's Rep Card and pay
  const pCards = isSales ? start(supabase.rpc('rep_cards', { p_from: salesWeek.from, p_to: salesWeek.to })) : none;
  const pComp = isSales ? start(supabase.rpc('comp_sales', { p_year: salesYear, p_emp: me.id })) : none;
  // Everyone: their schedule, every-other-week hours, company holidays, and bonus goals
  const pSchedule = start(supabase.from('schedules').select('weekday, start_time, end_time').eq('employee_id', me.id));
  const pSched2 = Promise.all([
    start(supabase.from('schedule_alt').select('weekday, start_time, end_time').eq('employee_id', me.id)),
    start(supabase.from('schedule_rotations').select('a_week').eq('employee_id', me.id).maybeSingle()),
    // Company holidays that are on (change 57): a company day off for everyone
    start(supabase.from('company_holidays').select('key, enabled').eq('enabled', true)),
  ]);
  const pBonusSets = me.rank >= 2 || me.hr_approver
    ? start(supabase.from('bonus_members').select('set_id', { count: 'exact', head: true }).eq('employee_id', me.id))
    : Promise.resolve({ count: 0 });

  const [{ data: awards }, { data: payouts }] = await pEarnings;
  const [myComps, opsSuite, opsSnap] = await pRest;
  const officeStats = opsSuite?.data && opsSnap?.data ? { stats: buildOps(opsSuite.data), snap: buildSnapshot(opsSnap.data) } : null;
  const { data: feedback } = await pFeedback;
  const { data: route } = await pRoute;

  // Sales reps: their own Rep Card for this week
  let myCard = null;
  if (isSales) {
    const { data: rows } = await pCards;
    const { reps } = buildCards(rows, salesWeek.to);
    myCard = reps.find((r) => r.id === me.id) || {
      id: me.id, first_name: me.first_name, last_name: me.last_name, name: `${me.first_name} ${me.last_name}`,
      office: me.office, photo: me.photo_url, m: measure({}), weeks: [],
    };
  }

  // Sales reps: pay at a glance (shadow mode)
  let myPay = null;
  if (isSales) {
    const today = atlantaToday();
    const { data: comp } = await pComp;
    if (comp) {
      const st = statement(comp, me.id, Number(today.slice(0, 4)), today);
      const monday = nextMonday(today);
      const q = st.quarters.find((x) => x.payDate > today);
      myPay = { st, monday, week: st.weeks.find((w) => w.payday === monday), q };
    }
  }

  const { data: schedule } = await pSchedule;

  // Scheduled hours per weekday, in minutes from midnight
  const shifts = {};
  (schedule || []).forEach((d) => {
    if (d.start_time && d.end_time) shifts[d.weekday] = [toMinutes(d.start_time), toMinutes(d.end_time)];
  });
  // Every-other-week hours (change 54): week-B hours for the days that differ, and which Monday starts a week A
  const [{ data: altRows }, { data: rotRow }, { data: holidayRows }] = await pSched2;
  const holidayOn = followsHolidays(me.department) ? holidayLookup(holidayRows) : () => null;
  const altShifts = {};
  (altRows || []).forEach((d) => { altShifts[d.weekday] = d.start_time && d.end_time ? [toMinutes(d.start_time), toMinutes(d.end_time)] : null; });
  const aWeek = rotRow?.a_week || null;

  const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/New_York' }).format(new Date());
  const today = DAY_NAMES.indexOf(todayName);
  // Which week to show: ?week=0 is this week, 1 is next week, -1 is last week
  const asked = parseInt(searchParams?.week, 10);
  const week = Number.isNaN(asked) ? 0 : Math.min(WEEKS_AHEAD, Math.max(-WEEKS_BACK, asked));
  // Week is the default (best on a phone); ?sched=month shows the whole month, ?month=1 is next month
  const monthView = searchParams?.sched === 'month';
  const askedMonth = parseInt(searchParams?.month, 10);
  const schedMonth = Number.isNaN(askedMonth) ? 0 : Math.min(MONTHS_AHEAD, Math.max(-MONTHS_BACK, askedMonth));
  const homeHref = ({ view = monthView, w = week, m = schedMonth, day = dayOffset } = {}) => {
    const q = [view ? 'sched=month' : '', view && m ? `month=${m}` : '', !view && w ? `week=${w}` : '', day ? `day=${day}` : ''].filter(Boolean).join('&');
    return q ? `/?${q}` : '/';
  };
  const weekHref = (n) => homeHref({ view: false, w: n });
  const monthHref = (n) => homeHref({ view: true, m: n });
  const dayHref = (n) => homeHref({ day: n });

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
  // The rows to show: that week, or every day of the chosen month
  const rows = [];
  let monthLabel = '';
  if (monthView) {
    const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + schedMonth, 1, 12));
    monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
    for (const dt = new Date(first); dt.getUTCMonth() === first.getUTCMonth(); dt.setUTCDate(dt.getUTCDate() + 1)) {
      rows.push({ d: dt.getUTCDay(), ymd: dt.toISOString().slice(0, 10) });
    }
  } else {
    WEEK_ORDER.forEach((d) => rows.push({ d, ymd: dates[d] }));
  }
  const { data: timeOff } = await supabase
    .from('time_off_requests')
    .select('start_date, end_date, start_time, end_time, status')
    .eq('employee_id', me.id)
    .in('status', ['pending', 'approved'])
    .lte('start_date', rows[rows.length - 1].ymd)
    .gte('end_date', rows[0].ymd);
  // What a day's row says. Approved time off is taken out of the scheduled hours
  // ("9 AM – 5 PM" when someone leaves at 5); requested time off is shown alongside.
  function dayInfo(d, ymd) {
    const holiday = holidayOn(ymd);
    if (holiday) return { text: `${holiday} (company holiday)`, working: false, holiday: true };
    const shift = usualShift(shifts, altShifts, aWeek, ymd, d);
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

  // Quarterly bonus link for people with goals of their own (managers)
  const { count: bonusSets } = await pBonusSets;

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

        {me.rank >= 2 && <Outbox />}

        {feedback && <MyFeedback data={feedback} />}

        {officeStats && (
          <OfficeKpis office={me.office || 'total'} stats={officeStats.stats} snap={officeStats.snap} monthName={officeStats.snap.thisMonth} />
        )}

        <MyCompetitions list={myComps} />

        {bonusSets > 0 && (
          <Link className="home-bonus" href="/bonus">
            <span><b>Your quarterly bonus</b><small>See your goals and what you’re earning so far</small></span>
            <span aria-hidden="true">›</span>
          </Link>
        )}

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
            <div className="rc-seg week-seg" role="group" aria-label="Show">
              <Link className={monthView ? '' : 'on'} href={weekHref(0)} scroll={false}>Week</Link>
              <Link className={monthView ? 'on' : ''} href={monthHref(0)} scroll={false}>Month</Link>
            </div>
            {monthView ? (
              <nav className="week-nav" aria-label="Choose a month">
                {schedMonth > -MONTHS_BACK
                  ? <Link className="week-arrow" href={monthHref(schedMonth - 1)} aria-label="Previous month" scroll={false}>‹</Link>
                  : <span className="week-arrow" aria-hidden="true">‹</span>}
                {schedMonth === 0
                  ? <span className="week-label">This month</span>
                  : <Link className="week-label" href={monthHref(0)} scroll={false}>{monthLabel}</Link>}
                {schedMonth < MONTHS_AHEAD
                  ? <Link className="week-arrow" href={monthHref(schedMonth + 1)} aria-label="Next month" scroll={false}>›</Link>
                  : <span className="week-arrow" aria-hidden="true">›</span>}
              </nav>
            ) : (
              <nav className="week-nav" aria-label="Choose a week">
                {week > -WEEKS_BACK
                  ? <Link className="week-arrow" href={weekHref(week - 1)} aria-label="Previous week" scroll={false}>‹</Link>
                  : <span className="week-arrow" aria-hidden="true">‹</span>}
                {week === 0
                  ? <span className="week-label">This week</span>
                  : <Link className="week-label" href={weekHref(0)} scroll={false}>Week of {shortDate(dates[1])}</Link>}
                {week < WEEKS_AHEAD
                  ? <Link className="week-arrow" href={weekHref(week + 1)} aria-label="Next week" scroll={false}>›</Link>
                  : <span className="week-arrow" aria-hidden="true">›</span>}
              </nav>
            )}
          </div>
          {monthView && schedMonth === 0 && <p className="calc-hint week-month-name">{monthLabel}</p>}
          <ul className="week">
            {rows.map(({ d, ymd }, i) => {
              const { text, working, holiday } = dayInfo(d, ymd);
              return (
                <li key={ymd} className={`day${working ? '' : ' off'}${holiday ? ' holiday' : ''}${ymd === todayYmd ? ' today' : ''}${monthView && d === 1 && i > 0 ? ' week-break' : ''}`}>
                  <span className="day-name">{DAY_NAMES[d]}, {shortDate(ymd)}</span>
                  <span className="day-hours">{text}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <ProfileActions employeeId={me.id} email={user.email} isSales={me.department === 'sales'}
          person={{ first_name: me.first_name, last_name: me.last_name, office: me.office, department: me.department, level: me.level }} />

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
