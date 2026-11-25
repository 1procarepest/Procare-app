-- 94 (2026-11-25). Onboarding tests: a test people must pass, not just "I've read this" (John). First one: the
-- Company Handbook 2.0 test.
--  * onboarding_quizzes: a question pool (from supabase/data/handbook-quiz.json for the handbook), who takes it (same
--    rules as documents: departments or certain people; empty = everyone), how many questions each try asks, and the
--    score needed (100%). Retakes are unlimited; each try draws a new set and shuffles the answers.
--  * The answer key never leaves the database: a try is started here (which questions, in which order) and graded here.
--    A missed question shows the handbook section and page to reread, not the right answer.
--  * Handbook test: technicians, office and wildlife (sales reps are 1099 contractors with their own agreement; add
--    'sales' to departments to include them).
-- Safe to run twice; running it again with changed questions bumps the version, so everyone takes the new test.

begin;

create table if not exists public.onboarding_quizzes (
  id          uuid primary key default gen_random_uuid(),
  key         text unique,
  title       text not null,
  description text,
  category    text not null default 'Handbook',
  departments text[] not null default '{}',
  people      uuid[] not null default '{}',
  ask_count   integer not null default 20 check (ask_count > 0),
  pass_pct    integer not null default 100 check (pass_pct between 1 and 100),
  questions   jsonb not null,            -- [{ id, q, choices: [..], answer: index, section, page }]
  version     integer not null default 1,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.onboarding_quizzes enable row level security;
revoke all on public.onboarding_quizzes from anon, authenticated;
drop trigger if exists log_onboarding_quizzes on public.onboarding_quizzes;
create trigger log_onboarding_quizzes after insert or delete or update on public.onboarding_quizzes for each row execute function log_change();

create table if not exists public.onboarding_quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.onboarding_quizzes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  version     integer not null,
  asked       jsonb not null,            -- [{ id, order: [original choice indexes, as shown] }]
  answers     jsonb,
  score       integer,
  total       integer not null,
  passed      boolean,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists onboarding_quiz_attempts_who on public.onboarding_quiz_attempts (quiz_id, employee_id);
alter table public.onboarding_quiz_attempts enable row level security;
revoke all on public.onboarding_quiz_attempts from anon, authenticated;

-- Is a test for this person?
create or replace function public.quiz_for(z public.onboarding_quizzes, e public.employees)
returns boolean language sql stable security definer set search_path = public as $$
  select e.active and z.active and case
    when cardinality(z.people) > 0 then e.id = any(z.people)
    when cardinality(z.departments) > 0 then e.department::text = any(z.departments)
    else true end
$$;
revoke all on function public.quiz_for(public.onboarding_quizzes, public.employees) from public, anon;

-- My tests and where I stand; for C-Suite and HR everyone's, for managers the people they manage
create or replace function public.onboarding_quiz_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me_id uuid := my_id(); boss boolean := can_manage_onboarding(); result jsonb;
begin
  if me_id is null then return null; end if;
  select jsonb_build_object(
    'quizzes', (select coalesce(jsonb_agg(x order by x.title), '[]') from (
        select z.id, z.key, z.title, z.description, z.category, z.ask_count, z.pass_pct, z.version,
               jsonb_array_length(z.questions) as pool, quiz_for(z, me) as mine,
               (select max(a.finished_at) from onboarding_quiz_attempts a where a.quiz_id = z.id and a.employee_id = me_id and a.version = z.version and a.passed) as passed_at,
               (select a.score from onboarding_quiz_attempts a where a.quiz_id = z.id and a.employee_id = me_id and a.finished_at is not null order by a.finished_at desc limit 1) as last_score,
               (select count(*) from onboarding_quiz_attempts a where a.quiz_id = z.id and a.employee_id = me_id and a.finished_at is not null) as tries
        from onboarding_quizzes z join employees me on me.id = me_id
        where z.active and (boss or quiz_for(z, me))) x),
    'status', (select coalesce(jsonb_agg(s order by s.title), '[]') from (
        select z.id, z.title, z.version,
               (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', e.id, 'name', e.first_name || ' ' || e.last_name, 'office', e.office, 'department', e.department,
                          'passed_at', p.passed_at, 'tries', coalesce(t.tries, 0), 'best', t.best)
                        order by p.passed_at nulls first, e.first_name, e.last_name), '[]')
                from employees e
                left join lateral (select max(a.finished_at) as passed_at from onboarding_quiz_attempts a
                                   where a.quiz_id = z.id and a.employee_id = e.id and a.version = z.version and a.passed) p on true
                left join lateral (select count(*) as tries, max(round(100.0 * a.score / nullif(a.total, 0))) as best from onboarding_quiz_attempts a
                                   where a.quiz_id = z.id and a.employee_id = e.id and a.finished_at is not null) t on true
                where quiz_for(z, e) and e.id <> me_id and (boss or can_manage(e.id))) as people
        from onboarding_quizzes z where z.active) s)
  ) into result;
  return result;
end $$;
revoke all on function public.onboarding_quiz_data() from public, anon;
grant execute on function public.onboarding_quiz_data() to authenticated;

-- Start a try: picks ask_count questions at random and shuffles each one's answers. Returns no answer key.
create or replace function public.start_onboarding_quiz(p_quiz uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare z onboarding_quizzes; e employees; picked jsonb; attempt uuid;
begin
  select * into z from onboarding_quizzes where id = p_quiz;
  select * into e from employees where id = my_id();
  if z.id is null or e.id is null or not (quiz_for(z, e) or can_manage_onboarding()) then raise exception 'That test isn''t one of yours.'; end if;
  select jsonb_agg(jsonb_build_object('id', q->>'id',
           'order', (select jsonb_agg(i order by random()) from generate_series(0, jsonb_array_length(q->'choices') - 1) i)))
    into picked
    from (select q from jsonb_array_elements(z.questions) q order by random() limit z.ask_count) s;
  insert into onboarding_quiz_attempts (quiz_id, employee_id, version, asked, total)
  values (z.id, e.id, z.version, picked, jsonb_array_length(picked)) returning id into attempt;
  return jsonb_build_object('attempt', attempt, 'title', z.title, 'pass_pct', z.pass_pct, 'questions', (
    select jsonb_agg(jsonb_build_object('id', a->>'id', 'q', q->>'q', 'section', q->>'section', 'page', q->'page',
             'choices', (select jsonb_agg(q->'choices'->((o)::int) order by n) from jsonb_array_elements_text(a->'order') with ordinality as t(o, n)))
           order by k)
    from jsonb_array_elements(picked) with ordinality as p(a, k)
    join lateral (select x as q from jsonb_array_elements(z.questions) x where x->>'id' = a->>'id' limit 1) qq on true));
end $$;
revoke all on function public.start_onboarding_quiz(uuid) from public, anon;
grant execute on function public.start_onboarding_quiz(uuid) to authenticated;

-- Grade a try. p_answers: { questionId: index as shown }. Returns the score and which questions were missed
-- (with the handbook section and page), never the right answers.
create or replace function public.submit_onboarding_quiz(p_attempt uuid, p_answers jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a onboarding_quiz_attempts; z onboarding_quizzes; right_count int := 0; missed jsonb := '[]'; item jsonb; q jsonb; shown text; picked int;
begin
  select * into a from onboarding_quiz_attempts where id = p_attempt;
  if a.id is null or a.employee_id <> my_id() then raise exception 'That test try isn''t yours.'; end if;
  if a.finished_at is not null then raise exception 'This try is already graded. Start a new one.'; end if;
  select * into z from onboarding_quizzes where id = a.quiz_id;
  for item in select * from jsonb_array_elements(a.asked) loop
    select x into q from jsonb_array_elements(z.questions) x where x->>'id' = item->>'id' limit 1;
    shown := p_answers->>(item->>'id');
    picked := case when shown ~ '^\d+$' and shown::int < jsonb_array_length(item->'order') then (item->'order'->>(shown::int))::int end;
    if q is not null and picked is not null and picked = (q->>'answer')::int then
      right_count := right_count + 1;
    else
      missed := missed || jsonb_build_array(jsonb_build_object('id', item->>'id', 'q', q->>'q', 'section', q->>'section', 'page', q->'page'));
    end if;
  end loop;
  update onboarding_quiz_attempts set answers = p_answers, score = right_count, finished_at = now(),
         passed = (100.0 * right_count / nullif(total, 0)) >= z.pass_pct
   where id = a.id returning * into a;
  return jsonb_build_object('score', a.score, 'total', a.total, 'passed', a.passed, 'pass_pct', z.pass_pct, 'missed', missed);
end $$;
revoke all on function public.submit_onboarding_quiz(uuid, jsonb) from public, anon;
grant execute on function public.submit_onboarding_quiz(uuid, jsonb) to authenticated;

-- The Company Handbook 2.0 test (61 questions, 20 a try, 100% to pass)
insert into public.onboarding_quizzes as z (key, title, description, category, departments, ask_count, pass_pct, questions)
values ('handbook', 'Company Handbook test',
        'Show you''ve read and understand the Company Handbook 2.0. 20 questions; you need 100% to pass, and you can retake it as many times as you like.',
        'Handbook', array['technician', 'administrative', 'wildlife'], 20, 100,
        $quiz$[
 {
  "id": "mission",
  "page": 6,
  "section": "Mission",
  "q": "What is Procare's slogan (the summary of our mission)?",
  "choices": [
   "Make Money, Improve Lives",
   "The Customer Is Always Right",
   "Bugs Out, Family In",
   "Service First, Sales Second"
  ],
  "answer": 0
 },
 {
  "id": "motto",
  "page": 6,
  "section": "Mission",
  "q": "What is Procare's motto?",
  "choices": [
   "The Best Care IS Procare!",
   "We Kill Bugs Dead",
   "Always On Time",
   "Pest Free or It's Free"
  ],
  "answer": 0
 },
 {
  "id": "values",
  "page": 6,
  "section": "Core values",
  "q": "Which of these is NOT one of Procare's core values?",
  "choices": [
   "The Customer Is Always Right",
   "Extreme Ownership",
   "Relationships Matter",
   "Nurture Stewardship"
  ],
  "answer": 0
 },
 {
  "id": "values2",
  "page": 6,
  "section": "Core values",
  "q": "Which of these IS one of Procare's core values?",
  "choices": [
   "Embrace the Grind",
   "Work Hard, Play Hard",
   "Never Say No",
   "Speed Over Quality"
  ],
  "answer": 0
 },
 {
  "id": "sidejobs",
  "page": 8,
  "section": "Personal responsibilities",
  "q": "How should other work, like Uber or multi-level marketing, fit with your job at Procare?",
  "choices": [
   "Procare is your primary employer and other work comes second",
   "Side jobs are fine during slow parts of your route",
   "Side jobs are not allowed at all",
   "It doesn't matter as long as you hit your numbers"
  ],
  "answer": 0
 },
 {
  "id": "intro",
  "page": 8,
  "section": "Introductory period",
  "q": "How long is the introductory period for a new team member?",
  "choices": [
   "The first 90 days",
   "The first 30 days",
   "The first 6 months",
   "There isn't one"
  ],
  "answer": 0
 },
 {
  "id": "atwill",
  "page": 8,
  "section": "Employment at will",
  "q": "Employment at Procare is \"at-will.\" What does that mean?",
  "choices": [
   "Either you or Procare can end employment at any time, with or without cause or notice",
   "You're guaranteed a job for one year",
   "You can only be let go after three write-ups",
   "Procare must give 30 days' notice before ending employment"
  ],
  "answer": 0
 },
 {
  "id": "harass",
  "page": 9,
  "section": "Equal employment opportunity",
  "q": "If you believe you've been harassed at work, who should you report it to?",
  "choices": [
   "Your supervisor, another manager, or Ally Boyd (HR)",
   "Only the person who harassed you",
   "A coworker you trust",
   "Nobody, unless it happens twice"
  ],
  "answer": 0
 },
 {
  "id": "dating",
  "page": 9,
  "section": "Social relationships at work",
  "q": "Can a supervisor date a team member they supervise?",
  "choices": [
   "No, unless they're already married or John Ely has given direct consent",
   "Yes, as long as it doesn't affect their work",
   "Yes, if they tell a coworker",
   "Only after the introductory period"
  ],
  "answer": 0
 },
 {
  "id": "i9",
  "page": 10,
  "section": "Legal to work",
  "q": "Within how many business days of starting must you complete the I-9 and provide your work documents?",
  "choices": [
   "3 business days",
   "1 business day",
   "10 business days",
   "30 business days"
  ],
  "answer": 0
 },
 {
  "id": "mvr",
  "page": 10,
  "section": "Legal to work",
  "q": "What must you give your direct manager on your first day to be hired?",
  "choices": [
   "A copy of your MVR (motor vehicle record)",
   "Your vehicle title",
   "A letter of recommendation",
   "Your high school diploma"
  ],
  "answer": 0
 },
 {
  "id": "drugarrest",
  "page": 11,
  "section": "Drugs and alcohol",
  "q": "If you're arrested or convicted of a drug-related offense (on or off the job), when must you report it to Ally Boyd and your branch supervisor?",
  "choices": [
   "Immediately, within 24 hours",
   "Within 2 weeks",
   "At your next performance review",
   "Only if it happened on the job"
  ],
  "answer": 0
 },
 {
  "id": "rx",
  "page": 11,
  "section": "Drugs and alcohol",
  "q": "You're prescribed a medication that may affect your judgment or performance. What do you do?",
  "choices": [
   "Notify your supervisor immediately",
   "Nothing; prescriptions are private",
   "Tell a coworker so they can watch you",
   "Stop taking it on work days"
  ],
  "answer": 0
 },
 {
  "id": "drugtest",
  "page": 12,
  "section": "Drugs and alcohol",
  "q": "What happens if you refuse a drug test when Procare asks for one?",
  "choices": [
   "You're subject to dismissal",
   "Nothing, testing is optional",
   "You get a verbal warning",
   "You can take it next month instead"
  ],
  "answer": 0
 },
 {
  "id": "endequip",
  "page": 12,
  "section": "End of employment",
  "q": "When your employment ends and company equipment is missing or damaged (like a cracked iPad screen), what happens?",
  "choices": [
   "You're responsible; it can come out of your last paycheck or be paid out of pocket",
   "Procare covers it as normal wear",
   "Nothing, once you've left",
   "It's split with your manager"
  ],
  "answer": 0
 },
 {
  "id": "resign",
  "page": 13,
  "section": "If you resign",
  "q": "How much notice should you give if you decide to resign?",
  "choices": [
   "At least two weeks, in writing",
   "One day",
   "None is needed",
   "One month, by phone"
  ],
  "answer": 0
 },
 {
  "id": "problem1",
  "page": 14,
  "section": "Problem-solving procedure",
  "q": "You have a work problem or complaint. What's the first step?",
  "choices": [
   "Discuss it with your branch supervisor, within 2 workdays",
   "Post about it in the team group chat",
   "Talk it over with coworkers first",
   "Email the owner directly"
  ],
  "answer": 0
 },
 {
  "id": "problem2",
  "page": 14,
  "section": "Problem-solving procedure",
  "q": "If your supervisor's answer doesn't resolve it, you can take it to Ally Boyd (HR). How soon will HR give you an answer?",
  "choices": [
   "Within 5 working days",
   "Within 24 hours",
   "Within 30 days",
   "At your yearly review"
  ],
  "answer": 0
 },
 {
  "id": "gossip",
  "page": 15,
  "section": "Gossiping policy",
  "q": "Under Procare's gossiping policy, what counts as gossip?",
  "choices": [
   "Talking negatively about someone with people who aren't part of the solution",
   "Reporting harassment to HR",
   "Discussing pay or safety in a professional way",
   "Giving feedback in a performance conversation"
  ],
  "answer": 0
 },
 {
  "id": "gossip2",
  "page": 15,
  "section": "Gossiping policy",
  "q": "Which of these is NOT gossip?",
  "choices": [
   "Raising a concern directly with your manager, HR, or the person involved",
   "Sharing a rumor about a coworker's discipline",
   "Criticizing a coworker to others instead of talking to them",
   "Repeating \"I heard...\" stories"
  ],
  "answer": 0
 },
 {
  "id": "gossip3",
  "page": 16,
  "section": "Gossiping policy",
  "q": "A coworker starts gossiping to you about someone. What does the policy ask you to do?",
  "choices": [
   "Redirect it, e.g. \"Have you talked to them about this?\"",
   "Listen, but don't repeat it",
   "Pass it along to your manager as a rumor",
   "Join in so you fit in"
  ],
  "answer": 0
 },
 {
  "id": "workweek",
  "page": 18,
  "section": "Your work week",
  "q": "Procare's regular workweek is 40 hours. Who must approve overtime, and when?",
  "choices": [
   "Your manager, in advance",
   "No one; just work it",
   "HR, after the fact",
   "A coworker who covers for you"
  ],
  "answer": 0
 },
 {
  "id": "start9",
  "page": 19,
  "section": "Your work week",
  "q": "If your day starts at 9:00 a.m., where should you be at 9:00?",
  "choices": [
   "At your first appointment (the customer's home) or your job site for the day",
   "Leaving your house",
   "At the gas station",
   "Clocking in from your driveway"
  ],
  "answer": 0
 },
 {
  "id": "lunch",
  "page": 19,
  "section": "Lunch and breaks",
  "q": "Which is true about lunch breaks for technicians?",
  "choices": [
   "Lunch is unpaid, up to one hour, you clock out, and the place must be within a 5-minute drive",
   "Lunch is paid and can be anywhere",
   "You stay clocked in for lunch",
   "Lunch must be exactly 30 minutes at the office"
  ],
  "answer": 0
 },
 {
  "id": "personal",
  "page": 19,
  "section": "Lunch and breaks",
  "q": "You stop to take a personal call or grab a snack during the day. What should you do?",
  "choices": [
   "Clock out",
   "Stay clocked in; it's short",
   "Note it at the end of the week",
   "Nothing, if your manager doesn't see it"
  ],
  "answer": 0
 },
 {
  "id": "gap",
  "page": 19,
  "section": "Gaps in the work day",
  "q": "You have an hour of \"gap time\" between appointments. What's the ideal use of it?",
  "choices": [
   "Take your one-hour lunch break",
   "Go home and stay clocked in",
   "Sit in the truck clocked in",
   "Start your next day's route early"
  ],
  "answer": 0
 },
 {
  "id": "gap2",
  "page": 19,
  "section": "Gaps in the work day",
  "q": "If you stay clocked in during gap time, what must you do?",
  "choices": [
   "Do something beneficial for the company (flyers, door hangers, restock, truck care) and tell your supervisor",
   "Nothing special",
   "Run personal errands",
   "Wait at a restaurant"
  ],
  "answer": 0
 },
 {
  "id": "gaphome",
  "page": 20,
  "section": "Gaps in the work day",
  "q": "When can a technician clock out and head home during a gap?",
  "choices": [
   "When nothing beneficial is possible, you're within 10 minutes of home, and you've notified your manager (giving them 5 minutes to respond)",
   "Any time it rains",
   "Whenever a customer cancels, without telling anyone",
   "Never"
  ],
  "answer": 0
 },
 {
  "id": "paidstart",
  "page": 20,
  "section": "Time clock policies",
  "q": "When does a technician's paid time start in the morning?",
  "choices": [
   "When they arrive at their first appointment (or the office, if restocking for the day)",
   "When they leave home",
   "When they get gas",
   "At 8:00 a.m. no matter what"
  ],
  "answer": 0
 },
 {
  "id": "timefix",
  "page": 20,
  "section": "Time records",
  "q": "You forgot to clock in. Who fixes your time record?",
  "choices": [
   "Your supervisor or the office manager",
   "You edit it yourself",
   "A coworker",
   "It can't be fixed"
  ],
  "answer": 0
 },
 {
  "id": "late",
  "page": 21,
  "section": "Being present and on time",
  "q": "If you can't make it to work or will be late, how should your manager hear about it?",
  "choices": [
   "You call your manager yourself, no later than 8:00 a.m.",
   "A family member texts the office",
   "Tell a coworker to pass it on",
   "Email by noon"
  ],
  "answer": 0
 },
 {
  "id": "notes",
  "page": 21,
  "section": "Call out",
  "q": "When does Procare start addressing dependability concerns about doctor's notes?",
  "choices": [
   "After more than three separate doctor's notes in a quarter",
   "After the first one",
   "Never; notes always excuse you",
   "After ten in a year"
  ],
  "answer": 0
 },
 {
  "id": "review",
  "page": 23,
  "section": "Performance review",
  "q": "What's part of your yearly performance review?",
  "choices": [
   "A ride-along with a supervisor for a full or partial day",
   "A written exam",
   "A customer survey only",
   "Nothing; there are no reviews"
  ],
  "answer": 0
 },
 {
  "id": "negligence",
  "page": 24,
  "section": "Care of equipment",
  "q": "You damage company property through negligence or misuse. What can happen?",
  "choices": [
   "You may be held financially responsible; a manager reviews each case",
   "Nothing, it's covered",
   "Automatic termination",
   "It's taken out of a coworker's pay"
  ],
  "answer": 0
 },
 {
  "id": "uniform",
  "page": 24,
  "section": "Dress code",
  "q": "Which part of the uniform does the team member pay for?",
  "choices": [
   "Khaki uniform pants and work boots",
   "Uniform shirts",
   "Procare hats",
   "Procare jackets"
  ],
  "answer": 0
 },
 {
  "id": "pants",
  "page": 25,
  "section": "Dress code",
  "q": "Which pant colors match Procare's brand?",
  "choices": [
   "Dark blue, tan (khaki), or dark grey",
   "Any color jeans",
   "Black or white",
   "Camo"
  ],
  "answer": 0
 },
 {
  "id": "hat",
  "page": 25,
  "section": "Dress code",
  "q": "If you wear a hat on the job, which hats are allowed?",
  "choices": [
   "Only a company-issued Procare hat",
   "Any plain hat",
   "A hat from your favorite team",
   "No hats ever"
  ],
  "answer": 0
 },
 {
  "id": "riders",
  "page": 25,
  "section": "Company vehicles",
  "q": "Who may ride in a Procare company vehicle?",
  "choices": [
   "Only Procare employees",
   "Your family, if they wear seat belts",
   "Customers who need a ride",
   "Anyone, on weekends"
  ],
  "answer": 0
 },
 {
  "id": "phone",
  "page": 26,
  "section": "Company vehicles",
  "q": "In Georgia, what's the law on cell phones while driving?",
  "choices": [
   "It's unlawful to hold a cell phone while driving",
   "You can text at red lights",
   "Calls are fine if they're short",
   "There's no law"
  ],
  "answer": 0
 },
 {
  "id": "accident",
  "page": 26,
  "section": "Accidents",
  "q": "You're in an accident in a Procare vehicle. Which is correct?",
  "choices": [
   "Check that everyone is okay, move to safety if drivable, call 911, call your supervisor, and never admit liability at the scene",
   "Apologize and say it was your fault",
   "Leave if nobody is hurt",
   "Call your supervisor tomorrow"
  ],
  "answer": 0
 },
 {
  "id": "deductible",
  "page": 26,
  "section": "Accidents",
  "q": "If you're in an at-fault accident in a Procare vehicle, what do you pay?",
  "choices": [
   "At least half of the current deductible",
   "Nothing",
   "The whole repair bill",
   "One week's pay"
  ],
  "answer": 0
 },
 {
  "id": "driving",
  "page": 27,
  "section": "Safe driving program",
  "q": "Which driving record can get a team member dismissed?",
  "choices": [
   "3 chargeable accidents or moving violations within 12 months, or 1 DUI within 36 months",
   "1 parking ticket",
   "A speeding ticket from 10 years ago",
   "Driving a personal car to work"
  ],
  "answer": 0
 },
 {
  "id": "tips",
  "page": 30,
  "section": "Business gifts",
  "q": "A customer offers you a tip. What's the policy?",
  "choices": [
   "Politely decline; if they insist, accept it and document it (what and when) in the customer note",
   "Always accept and keep it quiet",
   "Refuse no matter what",
   "Split it with the office"
  ],
  "answer": 0
 },
 {
  "id": "contracts",
  "page": 31,
  "section": "Authority to enter contracts",
  "q": "Who can enter a contract on behalf of Procare?",
  "choices": [
   "Only a person authorized by management",
   "Any team member",
   "Any technician with a license",
   "Customers"
  ],
  "answer": 0
 },
 {
  "id": "benefits",
  "page": 32,
  "section": "Benefits",
  "q": "Who is eligible for team member benefits?",
  "choices": [
   "Regular full-time team members after 6 months",
   "Everyone from day one",
   "Part-time team members only",
   "Only managers"
  ],
  "answer": 0
 },
 {
  "id": "freepest",
  "page": 32,
  "section": "Free pest service",
  "q": "What's the rule for treating your own home for free?",
  "choices": [
   "Off the clock, not interfering with your route, approved by your manager, your own home only",
   "Any time, for any home",
   "During your route if you're nearby",
   "Only termite service is free"
  ],
  "answer": 0
 },
 {
  "id": "vacation",
  "page": 32,
  "section": "Vacation",
  "q": "How do you request vacation, and when?",
  "choices": [
   "Through Sling, before the next month's schedule is released; it's not approved until a manager approves it in Sling",
   "Tell a coworker the day before",
   "Text the office the morning of",
   "Vacation is assigned by HR"
  ],
  "answer": 0
 },
 {
  "id": "vacation2",
  "page": 33,
  "section": "Vacation",
  "q": "If you leave Procare with vacation hours you haven't used, what happens to them?",
  "choices": [
   "They're not paid out",
   "They're paid in your last check",
   "They carry over if you come back",
   "They go to a coworker"
  ],
  "answer": 0
 },
 {
  "id": "parental",
  "page": 33,
  "section": "Parental leave",
  "q": "What paid parental leave do full-time team members get after 6 months?",
  "choices": [
   "2 weeks paid",
   "None",
   "12 weeks paid",
   "1 day paid"
  ],
  "answer": 0
 },
 {
  "id": "401k",
  "page": 33,
  "section": "401K",
  "q": "How does Procare's 401K match work?",
  "choices": [
   "Put away 1% of your pay and Procare matches 1%, available after 6 months",
   "Procare matches 10% from day one",
   "There is no match",
   "Procare pays it all"
  ],
  "answer": 0
 },
 {
  "id": "techsale",
  "page": 34,
  "section": "Sales for techs and admin",
  "q": "A technician makes a sale. What do they earn, and when?",
  "choices": [
   "A $100 sales bonus once the sale is serviced",
   "$100 the day they sell it",
   "Nothing; techs can't sell",
   "10% of the contract, paid in January"
  ],
  "answer": 0
 },
 {
  "id": "holidays",
  "page": 34,
  "section": "Holidays",
  "q": "Which of these is NOT one of Procare's holidays?",
  "choices": [
   "Presidents' Day",
   "Day after Thanksgiving",
   "Christmas Eve",
   "Martin Luther King Day"
  ],
  "answer": 0
 },
 {
  "id": "sick",
  "page": 35,
  "section": "Sick days",
  "q": "You're sick in your first year and have no doctor's note. Which is true?",
  "choices": [
   "Tell your supervisor at least 1 hour before your shift, and make up the day (e.g. the next Saturday)",
   "It's paid, no questions asked",
   "Just don't show up",
   "You must use a vacation day"
  ],
  "answer": 0
 },
 {
  "id": "sick2",
  "page": 35,
  "section": "Sick days",
  "q": "After your first year, how many paid sick days do you get?",
  "choices": [
   "2 a year, starting January 1 (paid with a doctor's note)",
   "10 a year",
   "Unlimited",
   "None"
  ],
  "answer": 0
 },
 {
  "id": "media",
  "page": 37,
  "section": "News media",
  "q": "A reporter asks you for a statement about Procare. What do you do?",
  "choices": [
   "Courteously decline and refer them to the CEO, John Ely",
   "Answer their questions honestly",
   "Post your answer on social media",
   "Ask them to call back later"
  ],
  "answer": 0
 },
 {
  "id": "inspect",
  "page": 37,
  "section": "Inspections",
  "q": "An inspector (Dept. of Agriculture, EPA, OSHA, etc.) approaches you. What's the first step?",
  "choices": [
   "Be courteous and call your supervisor or manager; don't answer questions, work, or sign anything unless authorized",
   "Answer every question in detail",
   "Ask them to leave",
   "Sign whatever they give you"
  ],
  "answer": 0
 },
 {
  "id": "political",
  "page": 38,
  "section": "Political activities",
  "q": "Which is allowed under the political activities policy?",
  "choices": [
   "Being involved in politics on your own time, without identifying as a Procare team member",
   "Wearing political buttons on your uniform",
   "Campaigning to customers during service",
   "Speaking to the news as a Procare employee"
  ],
  "answer": 0
 },
 {
  "id": "weapons",
  "page": 38,
  "section": "Weapons at work",
  "q": "What weapon may a team member have on company or customer property without prior approval?",
  "choices": [
   "A small pocket knife",
   "A hunting knife",
   "A handgun in the truck",
   "Any weapon, if it's legal"
  ],
  "answer": 0
 },
 {
  "id": "threat",
  "page": 38,
  "section": "Weapons at an appointment",
  "q": "Someone threatens you with a weapon at an appointment. What do you do?",
  "choices": [
   "Stop work, de-escalate, leave, and call your supervisor",
   "Finish the service quickly",
   "Argue with them",
   "Call the next customer"
  ],
  "answer": 0
 },
 {
  "id": "search",
  "page": 39,
  "section": "Search and security",
  "q": "Can Procare search your truck, bag or work area on company or customer property?",
  "choices": [
   "Yes, as part of an investigation, and you're expected to cooperate",
   "Only with a warrant",
   "No, never",
   "Only your desk"
  ],
  "answer": 0
 },
 {
  "id": "records",
  "page": 40,
  "section": "Personnel records",
  "q": "Your address or phone number changes. What should you do?",
  "choices": [
   "Promptly tell your supervisor in writing",
   "Nothing",
   "Update it at your next review",
   "Tell a coworker"
  ],
  "answer": 0
 }
]$quiz$::jsonb)
on conflict (key) do update set
  questions = excluded.questions, title = excluded.title, description = excluded.description,
  version = z.version + case when z.questions is distinct from excluded.questions then 1 else 0 end,
  updated_at = now();

commit;

notify pgrst, 'reload schema';

-- Check: the handbook test and how many questions it has
select title, jsonb_array_length(questions) as questions, ask_count as per_try, pass_pct, array_to_string(departments, ', ') as who
from public.onboarding_quizzes where key = 'handbook';
