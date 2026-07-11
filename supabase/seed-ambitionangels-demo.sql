-- Keystone demo seed: the Ambition Angels practice engagement.
-- Run against the real project after all migrations through 0025.
-- Idempotent throughout; safe to re-run.
--
-- WHAT THIS IS (deliberately): a second engagement under Sobo
-- Consulting, fabricated on purpose so the practice can log in from
-- the client side and see the whole system mid-flight. Rooted in what
-- is real: Ambition Angels is the practice's own org, the website
-- redesign of ambitionangels.org actually shipped, and the custom
-- BloomOS build is actually underway. The dates, sessions, homework,
-- messages, and digests below are backfilled fiction written to read
-- as four months of a six-month, $25,000 engagement (month 4 of 6 as
-- of 2026-07-11). The fee appears in the charter only, per gate 9.
--
-- Client-side logins: shannonsfair@gmail.com and remisobo@gmail.com.
-- Both auth users are pre-created here (mirroring the exact GoTrue row
-- shape of the existing magic-link users) and their memberships are
-- claimed, so client-authored history (messages, homework submissions,
-- the charter sign-off) can exist from the first login. A magic link
-- to either address signs into the pre-created user.
--
-- FLAGS:
--   - Deliverable and walkthrough URLs other than ambitionangels.org
--     are placeholders shaped like private doc links; they resolve to
--     a permission wall, which reads as real. Swap for live links at
--     will.
--   - No agreement PDF is seeded (engagement_documents needs a real
--     object in storage); the client home shows the quiet empty state
--     until one is uploaded.
--   - This data is demo fiction. Remove it by deleting the client row
--     ('Ambition Angels'); every scoped table cascades from it. The
--     two auth.users rows and the sent-digest rows would remain and
--     can be removed by email and engagement respectively.

-- 0. The two client-side auth users --------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
   created_at, updated_at, confirmation_token, recovery_token,
   email_change_token_new, email_change, email_change_token_current,
   phone_change, phone_change_token, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated', v.email, '',
       '2026-03-10 09:00-07'::timestamptz,
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{}'::jsonb,
       '2026-03-10 09:00-07'::timestamptz, '2026-03-10 09:00-07'::timestamptz,
       '', '', '', '', '', '', '', false, false
from (values ('shannonsfair@gmail.com'), ('remisobo@gmail.com')) as v(email)
where not exists (select 1 from auth.users u where lower(u.email) = v.email);

update auth.users u
set raw_user_meta_data = jsonb_build_object(
      'sub', u.id::text, 'email', u.email,
      'email_verified', true, 'phone_verified', false)
where lower(u.email) in ('shannonsfair@gmail.com','remisobo@gmail.com')
  and (u.raw_user_meta_data is null or u.raw_user_meta_data = '{}'::jsonb);

insert into auth.identities
  (id, user_id, provider_id, provider, identity_data,
   last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       '2026-03-10 09:00-07'::timestamptz,
       '2026-03-10 09:00-07'::timestamptz, '2026-03-10 09:00-07'::timestamptz
from auth.users u
where lower(u.email) in ('shannonsfair@gmail.com','remisobo@gmail.com')
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email');

-- 1. The client and its two members --------------------------------

with p as (select id from practices where slug = 'sobo')
insert into clients (practice_id, name, created_at)
select p.id, 'Ambition Angels', '2026-03-09 09:00-07'::timestamptz from p
where not exists (
  select 1 from clients c, p
  where c.practice_id = p.id and c.name = 'Ambition Angels');

with c as (
  select id, practice_id from clients where name = 'Ambition Angels')
insert into client_members (client_id, practice_id, email, user_id, claimed_at, created_at)
select c.id, c.practice_id, v.email,
       (select id from auth.users where lower(email) = v.email),
       '2026-03-10 09:05-07'::timestamptz,
       '2026-03-09 09:00-07'::timestamptz
from c, (values ('shannonsfair@gmail.com'), ('remisobo@gmail.com')) as v(email)
where not exists (
  select 1 from client_members m, c
  where m.client_id = c.id and lower(m.email) = v.email);

update client_members m
set user_id = (select id from auth.users where lower(email) = m.email),
    claimed_at = coalesce(m.claimed_at, '2026-03-10 09:05-07'::timestamptz)
where m.client_id = (select id from clients where name = 'Ambition Angels')
  and m.user_id is null;

-- 2. The engagement and its four workstreams ------------------------

with c as (select id, practice_id from clients where name = 'Ambition Angels')
insert into engagements
  (practice_id, client_id, title, starts_on, ends_on, fee_display, status, created_at)
select c.practice_id, c.id,
       'The front door and the hub: website and BloomOS',
       date '2026-03-09', date '2026-09-09',
       '$25,000, one fee, both builds',
       'active', '2026-03-09 09:00-07'::timestamptz
from c
where not exists (select 1 from engagements e, c where e.client_id = c.id);

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1)
insert into workstreams (engagement_id, practice_id, client_id, title, stage, sort, created_at)
select e.id, e.practice_id, e.client_id, v.title, v.stage, v.sort,
       '2026-03-09 09:00-07'::timestamptz
from e, (values
  ('The new website',          'done',   0),
  ('BloomOS, the custom build','train',  1),
  ('The data comes home',      'build',  2),
  ('Run it without us',        'design', 3)
) as v(title, stage, sort)
where not exists (select 1 from workstreams w, e where w.engagement_id = e.id);

-- Stage history, so the arcs read as four months of movement.
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
ws as (select w.id, w.title from workstreams w, e where w.engagement_id = e.id),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into workstream_stage_events
  (workstream_id, engagement_id, practice_id, client_id, from_stage, to_stage, note, actor_user_id, at)
select (select id from ws where title = v.ws), e.id, e.practice_id, e.client_id,
       v.from_stage, v.to_stage, v.note, (select user_id from remi), v.at::timestamptz
from e, (values
  ('The new website', 'diagnose', 'design',
   'The page inventory and the one-job-per-page map are agreed.', '2026-03-19 11:05-07'),
  ('The new website', 'design', 'build',
   'Design direction approved; the build starts on the new stack.', '2026-04-09 11:10-07'),
  ('The new website', 'build', 'train',
   'Staging walkthrough done; the team loads content themselves.', '2026-05-21 11:00-07'),
  ('The new website', 'train', 'stabilize',
   'ambitionangels.org is live; the punch list runs two weeks.', '2026-06-04 12:00-07'),
  ('The new website', 'stabilize', 'done',
   'Punch list cleared. The site is theirs.', '2026-06-25 11:15-07'),
  ('BloomOS, the custom build', 'diagnose', 'design',
   'The real week is mapped; the spreadsheets name the modules.', '2026-04-16 11:05-07'),
  ('BloomOS, the custom build', 'design', 'build',
   'Five modules for v1 agreed: programs, fellows, partners, money, board.', '2026-05-07 11:00-07'),
  ('BloomOS, the custom build', 'build', 'train',
   'All five modules stand; final touches and training from here.', '2026-07-09 11:20-07'),
  ('The data comes home', 'diagnose', 'design',
   'The data map is drafted from the spreadsheet inventory.', '2026-05-14 11:00-07'),
  ('The data comes home', 'design', 'build',
   'Migration begins with the fellows records.', '2026-06-11 11:05-07'),
  ('Run it without us', 'diagnose', 'design',
   'Handoff planning opens: what training the last two months hold.', '2026-06-25 11:30-07')
) as v(ws, from_stage, to_stage, note, at)
where not exists (
  select 1 from workstream_stage_events s, e where s.engagement_id = e.id);

-- 3. Sixteen held sessions, three on the calendar --------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into sessions
  (engagement_id, practice_id, client_id, starts_at, ends_at, tz, kind, status,
   purpose, created_by, created_at)
select e.id, e.practice_id, e.client_id,
       v.starts::timestamptz, v.starts::timestamptz + interval '60 minutes',
       'America/Los_Angeles', v.kind, v.status, v.purpose,
       (select user_id from remi), v.starts::timestamptz - interval '7 days'
from e, (values
  ('2026-03-12 10:00-07', 'working', 'held', 'Kickoff: walk the whole map, website first'),
  ('2026-03-19 10:00-07', 'working', 'held', 'Every page has one job: the site architecture'),
  ('2026-03-26 10:00-07', 'working', 'held', 'Site map sign-off and the content plan'),
  ('2026-04-02 10:00-07', 'working', 'held', 'The homepage story: fellows first, org second'),
  ('2026-04-09 10:00-07', 'working', 'held', 'Design direction review: type, color, imagery'),
  ('2026-04-16 10:00-07', 'working', 'held', 'BloomOS discovery: the real week, spreadsheet by spreadsheet'),
  ('2026-04-23 10:00-07', 'working', 'held', 'Staging walkthrough: the site takes shape'),
  ('2026-05-07 10:00-07', 'working', 'held', 'The BloomOS module map: five and no more'),
  ('2026-05-14 10:00-07', 'working', 'held', 'The data map: every spreadsheet and where it lands'),
  ('2026-05-21 10:00-07', 'working', 'held', 'Content week: the team loads the site themselves'),
  ('2026-05-28 10:00-07', 'working', 'held', 'BloomOS walkthrough: the five modules, end to end'),
  ('2026-06-04 11:00-07', 'review',  'held', 'Launch review: the new ambitionangels.org is live'),
  ('2026-06-11 10:00-07', 'working', 'held', 'Punch list and the fellows records begin moving'),
  ('2026-06-18 10:00-07', 'working', 'held', 'Fellows module working session: the spring cohort'),
  ('2026-06-25 10:00-07', 'working', 'held', 'Fellows module live; handoff planning opens'),
  ('2026-07-09 10:00-07', 'working', 'held', 'Board view first cut; the last two months take shape'),
  ('2026-07-16 10:00-07', 'working', 'booked', 'Training: run a real week inside BloomOS'),
  ('2026-07-23 10:00-07', 'working', 'booked', 'Training: partners and money, hands on keys'),
  ('2026-07-30 11:00-07', 'review',  'booked', 'Month five review: what stabilize looks like from here')
) as v(starts, kind, status, purpose)
where not exists (select 1 from sessions s, e where s.engagement_id = e.id);

-- Run of show on the most recent held session and the two ahead.
with e as (
  select id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
ws as (
  select w.id, w.title from workstreams w, e where w.engagement_id = e.id)
update sessions s
set agenda_md = v.agenda,
    moves_workstream_id = (select id from ws where title = v.ws),
    moves_to_stage = v.to_stage
from e, (values
  ('2026-07-09',
   $a$1. The board view, first cut: click through it together.
2. What is left on BloomOS before the freeze: the short list.
3. The last two months: training, not building. Agree the shape.$a$,
   'BloomOS, the custom build', 'train'),
  ('2026-07-16',
   $a$1. Shannon drives: this week's real tasks, entered and worked in BloomOS.
2. The fall program calendar, walked together in the programs module.
3. Where the old spreadsheets still pull; name each pull and retire it.$a$,
   'Run it without us', 'build'),
  ('2026-07-23',
   $a$1. Partners module: the summer list, live.
2. Money module: the grants picture, entered together.
3. Board view: what the board sees before the August meeting.$a$,
   'The data comes home', 'train')
) as v(day, agenda, ws, to_stage)
where s.engagement_id = e.id
  and s.starts_at::date = v.day::date
  and s.agenda_md is null;

-- 4. Session notes: four shared, one practice-only -------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
s as (
  select s.id, s.engagement_id, s.practice_id, s.client_id, s.starts_at::date as day
  from sessions s, e where s.engagement_id = e.id)
insert into session_notes
  (session_id, engagement_id, practice_id, client_id, summary_md, decisions_md, visibility, created_at, updated_at)
select s.id, s.engagement_id, s.practice_id, s.client_id, v.summary, v.decisions, v.visibility,
       (s.day + interval '1 day' + interval '17 hours')::timestamptz,
       (s.day + interval '1 day' + interval '17 hours')::timestamptz
from s
join (values
  ('2026-03-12',
   $md$Kickoff, the whole team on. The order of the engagement was walked end to end: the public face first, then the hub underneath it. The site carries the story; BloomOS carries the work. Both are custom builds and both belong to Ambition Angels outright. The team named what the current website fails to say and what the spreadsheets cost them every week.$md$,
   $md$1. Website first, then the platform. The story funds the work. (Kickoff, Mar 12.)
2. Ambition Angels owns everything in perpetuity: the repo, the database, the hub. (Kickoff, Mar 12.)
3. Weekly working sessions, Thursdays at ten, every week we are building. (Kickoff, Mar 12.)$md$,
   'shared'),
  ('2026-05-28',
   $md$The full BloomOS walkthrough: programs, fellows, partners, money, board, each module walked against a real task from the team's week. The shape held. Two findings went straight onto the build list: the fellows view needs the mentor beside the fellow on one screen, and the money module's grant stages should use the team's own words, not generic pipeline language.$md$,
   $md$1. The five-module shape is confirmed against real work. (Walkthrough, May 28.)
2. Grant stages take the team's language: exploring, asked, promised, received, reported. (Walkthrough, May 28.)$md$,
   'shared'),
  ('2026-06-04',
   $md$Launch review. The new ambitionangels.org is live. The homepage leads with the fellows and their outcomes; the story reads the way the team tells it in the room. The punch list from the first 48 hours is short and honest: two image crops, one broken partner logo link, the donate button's spacing on small phones. Two weeks of polish in public, then the site work closes.$md$,
   $md$1. Launch now, polish in public: the punch list runs two weeks. (Launch review, Jun 4.)$md$,
   'shared'),
  ('2026-07-09',
   $md$The board view, first cut, clicked through together: programs at a glance, the money picture, the fellows count with the story behind it. Read only, on purpose. The remaining BloomOS list is short: partner reminders, the grant report dates, the board invite flow. The last two months were shaped on the call: training over building, a feature freeze on August 1, and the team on the keys every session from here.$md$,
   $md$1. Feature freeze August 1: months five and six are training and handoff. (Jul 9.)
2. The board sees the first cut before the August board meeting. (Jul 9.)$md$,
   'shared'),
  ('2026-06-18',
   $md$Consultant note. Shannon is faster in the fellows module than the walkthrough predicted; the mentor-beside-fellow screen was the right call. Watch the second seat: partners entry keeps sliding a week, and the old drive is still the reflex when a document is needed. Bring the drive habit into the open at handoff planning rather than patching around it.$md$,
   null,
   'practice')
) as v(day, summary, decisions, visibility)
  on s.day = v.day::date
where not exists (select 1 from session_notes n where n.session_id = s.id);

-- 5. The charter, published and signed ------------------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into engagement_charters
  (engagement_id, practice_id, client_id, version, body_md, status,
   published_at, published_by, created_by, created_at, updated_at)
select e.id, e.practice_id, e.client_id, 1,
$charter$## Why this engagement exists
Ambition Angels has outgrown its own tools. The story the team tells in a room is better than the story the website tells, and the work of any given week lives in a dozen spreadsheets that only two people can read. This engagement fixes both: the public face and the operating hub, built once, built to be owned.

## What we are building
Over six months, Sobo Consulting redesigns and ships a new ambitionangels.org, then builds BloomOS for Ambition Angels: a custom hub holding programs, fellows, partners, money, and the board's view of all of it. The engagement runs six months at one fee, $25,000, covering both builds. Website first: the story funds the work.

## Where this ends
1. A website that tells the story the way the team tells it, live at ambitionangels.org, owned outright.
2. One hub holding programs, fellows, partners, and the money picture, shaped around how this team actually works.
3. The week running out of BloomOS, not out of spreadsheets.
4. The board seeing the work live, without waiting for a meeting.
5. Shannon and the team running all of it without us.

## How we will work
Weekly working sessions, Thursdays. Every session is a working session with homework before and after, always tied to a real task from the team's week. The site ships around month three; BloomOS modules go live one at a time as the data comes home; the last two months are training and handoff, not new building.

## What you own at the end
All of it, in perpetuity. The website: repo, domain, and content. BloomOS: the application, the database, and every record in it. Nothing rented, nothing held back, no ongoing fee to keep what was built.

## Roles
- Sobo Consulting designs, builds, and coaches the team onto the keys.
- Shannon leads the client side: content, data, and the final word on what feels like Ambition Angels.
- The second seat holds programs and partners: the partner list, the program calendar, and the real tasks each training session runs on.

## How we will know it worked
Three things, checked honestly: the story (the site says it as well as the room does), the system (the hub holds the real work, not a copy of it), and the habit (the team reaches for BloomOS first, week after week). The test at handoff: a new team member could find the work, read the story, and run the week without anyone explaining the old spreadsheets.

## What this engagement is not
- It is not a maintenance contract. Support after month six is its own conversation, scoped on its own.
- It is not a rebrand. The name, the logo, and the mission stay; the telling of them gets the upgrade.
- New BloomOS modules beyond the five are named now so asking later is easy: they are change orders, never scope creep.$charter$,
       'published',
       '2026-03-12 15:00-07'::timestamptz,
       (select user_id from remi), (select user_id from remi),
       '2026-03-11 09:00-07'::timestamptz, '2026-03-12 15:00-07'::timestamptz
from e
where not exists (select 1 from engagement_charters c, e where c.engagement_id = e.id);

-- The sign-off: requested at publish, approved by Shannon the next day.
-- The decider stamp trigger fires on pending-to-decided updates only,
-- so this backfilled insert carries its own decided fields.
with c as (
  select c.id, c.practice_id, c.client_id, c.engagement_id
  from engagement_charters c
  where c.client_id = (select id from clients where name = 'Ambition Angels')
    and c.version = 1 and c.status = 'published'),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1),
shannon as (
  select id from auth.users where lower(email) = 'shannonsfair@gmail.com' limit 1)
insert into approvals
  (practice_id, client_id, engagement_id, subject_type, subject_id, subject_label,
   requested_by, requested_at, status, decided_at, decided_by, decided_by_email, note_md, created_at)
select c.practice_id, c.client_id, c.engagement_id, 'charter', c.id,
       'the engagement charter, version 1',
       (select user_id from remi), '2026-03-12 15:05-07'::timestamptz,
       'approved', '2026-03-13 08:40-07'::timestamptz,
       (select id from shannon), 'shannonsfair@gmail.com',
       'Read it twice. This is exactly what we talked about. Signed for the team.',
       '2026-03-12 15:05-07'::timestamptz
from c
where not exists (
  select 1 from approvals a
  where a.subject_type = 'charter' and a.subject_id = c.id);

-- 6. The decision log -------------------------------------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
ws as (select w.title, w.id from workstreams w, e where w.engagement_id = e.id),
ses as (
  select s.starts_at::date as day, s.id from sessions s, e
  where s.engagement_id = e.id),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into decisions
  (engagement_id, practice_id, client_id, session_id, workstream_id,
   decided_on, title, context_md, decided_by_label, created_by, created_at)
select e.id, e.practice_id, e.client_id,
       (select id from ses where day = v.day::date),
       (select id from ws where title = v.ws),
       v.day::date, v.title, v.context, v.who, (select user_id from remi),
       (v.day || ' 17:00-07')::timestamptz
from e, (values
  ('2026-03-12', 'Website first, then the platform. The story funds the work.',
   'Kickoff. The public face ships before the hub; fundraising season is the deadline that matters.',
   'Shannon and Remi', 'The new website'),
  ('2026-03-12', 'Ambition Angels owns everything in perpetuity: the repo, the database, the hub itself.',
   'Kickoff, direct answer to Shannon. Custom build, nothing rented.',
   'Remi', 'BloomOS, the custom build'),
  ('2026-03-19', 'One story on every page: the fellows lead, the org follows.',
   'Site architecture session. Every page gets one job; the homepage''s job is the fellows.',
   'Shannon', 'The new website'),
  ('2026-03-26', 'The site ships on the new stack, in the org''s own accounts, keys handed over at launch.',
   'Sign-off session. Hosting, domain, and repo all live under Ambition Angels from day one.',
   'Shannon and Remi', 'The new website'),
  ('2026-04-16', 'BloomOS starts from the real week, not a feature list: the spreadsheets name the modules.',
   'Discovery session. Whatever the team touches weekly becomes a module; nothing else does.',
   'Shannon and Remi', 'BloomOS, the custom build'),
  ('2026-05-07', 'Five modules and no more for v1: programs, fellows, partners, money, board.',
   'Module map session. Everything else is a change order, named now so asking later is easy.',
   'Shannon and Remi', 'BloomOS, the custom build'),
  ('2026-05-21', 'Content freeze for launch: new copy waits for the punch list.',
   'Content week. The team finishes loading; edits after launch ride the two-week polish.',
   'Shannon', 'The new website'),
  ('2026-06-04', 'Launch now, polish in public: the punch list runs two weeks.',
   'Launch review. The site is live and honest; small fixes happen in the open.',
   'Shannon and Remi', 'The new website'),
  ('2026-06-25', 'The board view ships read only in v1. Board edits are a later conversation.',
   'Handoff planning. The board sees everything and touches nothing, on purpose.',
   'Shannon', 'BloomOS, the custom build'),
  ('2026-07-09', 'Feature freeze August 1: months five and six are training and handoff, not new builds.',
   'The last-two-months session. Final touches land in July; after that the team is on the keys.',
   'Shannon and Remi', 'Run it without us')
) as v(day, title, context, who, ws)
where not exists (select 1 from decisions d, e where d.engagement_id = e.id);

-- 7. Homework: done, in review, open, blocked, and one internal ------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
ws as (select w.title, w.id from workstreams w, e where w.engagement_id = e.id),
ses as (select s.starts_at::date as day, s.id from sessions s, e where s.engagement_id = e.id),
cm as (
  select lower(email) as email, id from client_members
  where client_id = (select client_id from e)),
pm as (
  select id from practice_members
  where lower(email) = 'remi@ambitionangels.org' limit 1)
insert into action_items
  (engagement_id, practice_id, client_id, workstream_id, session_id, title, body_md,
   assigned_client_member_id, assigned_practice_member_id, due_on, timing,
   status, done_at, review_requested, audience, source, created_at)
select e.id, e.practice_id, e.client_id,
       (select id from ws where title = v.ws),
       (select id from ses where day = v.session_day::date),
       v.title, v.body,
       (select id from cm where email = v.client_email),
       case when v.audience = 'practice' then (select id from pm) end,
       v.due_on::date, v.timing, v.status,
       case when v.done_day is not null then (v.done_day || ' 16:00-07')::timestamptz end,
       v.review, v.audience, 'manual',
       ((v.session_day)::date + interval '18 hours')::timestamptz
from e, (values
  ('Write the story of the last year in your own words: one page, plain language',
   'This becomes the About page''s spine. Do not write for a website; write it the way you told it at the spring showcase. We will shape it together.',
   'The new website', '2026-03-26', 'shannonsfair@gmail.com', '2026-04-02', 'before_session',
   'done', '2026-04-01', false, 'client'),
  ('Pick the twelve photos that feel most like us and drop them in the shared folder',
   'Real moments over posed shots. The design direction session works from these.',
   'The new website', '2026-03-26', 'remisobo@gmail.com', '2026-04-09', 'before_session',
   'done', '2026-04-08', false, 'client'),
  ('List every spreadsheet the team touches in a week: who owns it, how often, what breaks',
   'This list becomes the BloomOS module map. Nothing is too small; the annoying ones matter most.',
   'The data comes home', '2026-04-16', 'shannonsfair@gmail.com', '2026-04-23', 'after_session',
   'done', '2026-04-21', false, 'client'),
  ('Read the walkthrough notes and mark anything that does not match how you actually work',
   'Honest friction now saves a rebuild later. Margin notes are enough.',
   'BloomOS, the custom build', '2026-05-28', 'remisobo@gmail.com', '2026-06-04', 'after_session',
   'done', '2026-06-02', false, 'client'),
  ('Load the spring cohort into the fellows module: names, schools, mentors, notes',
   'First real data in the hub. Use the import sheet from the session; flag anything the fields will not hold.',
   'BloomOS, the custom build', '2026-06-18', 'shannonsfair@gmail.com', '2026-06-25', 'after_session',
   'done', '2026-06-26', true, 'client'),
  ('Enter the summer partner list into the partners module, one line on where each relationship stands',
   'The partners module goes live against this list. Where-it-stands can be a phrase, not a paragraph.',
   'The data comes home', '2026-06-25', 'remisobo@gmail.com', '2026-07-09', 'after_session',
   'open', null, true, 'client'),
  ('Draft the fall program calendar in BloomOS so we can walk it together on the 16th',
   'Programs module, real dates. Rough is fine; the session shapes it.',
   'BloomOS, the custom build', '2026-07-09', 'shannonsfair@gmail.com', '2026-07-15', 'before_session',
   'open', null, false, 'client'),
  ('Bring three real tasks from your week to run inside BloomOS live on the call',
   'Not demo tasks. The three things actually on your plate; we do them in the hub together.',
   'Run it without us', '2026-07-09', 'remisobo@gmail.com', '2026-07-16', 'before_session',
   'open', null, false, 'client'),
  ('Move the mentor match notes out of the old drive and into the fellows records',
   'The last fellows data still living outside the hub.',
   'The data comes home', '2026-06-25', 'shannonsfair@gmail.com', '2026-07-21', 'standing',
   'open', null, false, 'client'),
  ('Wire the board member invite flow and test it with a throwaway address before the Jul 16 session',
   'Internal. The board view is the August board meeting''s opener; the invite path has to be boring by then.',
   'BloomOS, the custom build', '2026-07-09', null, '2026-07-14', 'standing',
   'open', null, false, 'practice')
) as v(title, body, ws, session_day, client_email, due_on, timing, status, done_day, review, audience)
where not exists (select 1 from action_items a, e where a.engagement_id = e.id);

-- The activity trails: one full review loop, one submission waiting,
-- one honest block.
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
ai as (select a.title, a.id from action_items a, e where a.engagement_id = e.id),
cm as (
  select lower(email) as email, id from client_members
  where client_id = (select client_id from e)),
pm as (
  select id from practice_members
  where lower(email) = 'remi@ambitionangels.org' limit 1)
insert into homework_activity
  (action_item_id, engagement_id, practice_id, client_id,
   author_client_member_id, author_practice_member_id, kind, body_md, link_url, created_at)
select (select id from ai where title = v.item), e.id, e.practice_id, e.client_id,
       (select id from cm where email = v.client_email),
       case when v.client_email is null then (select id from pm) end,
       v.kind, v.body, v.link, v.at::timestamptz
from e, (values
  ('Load the spring cohort into the fellows module: names, schools, mentors, notes',
   'shannonsfair@gmail.com', 'submission',
   'All 34 in. Two fellows have co-mentors and the field only takes one; I put the second in the notes for now.',
   null, '2026-06-23 21:10-07'),
  ('Load the spring cohort into the fellows module: names, schools, mentors, notes',
   null, 'send_back',
   'So close. The co-mentor catch is exactly right, and I will add a second mentor field this week. One thing before I accept: eight records are missing the school year. Two minutes each, and the board view needs it to count right.',
   null, '2026-06-24 09:30-07'),
  ('Load the spring cohort into the fellows module: names, schools, mentors, notes',
   'shannonsfair@gmail.com', 'submission',
   'School years added on all eight. The cohort view looks right to me now.',
   null, '2026-06-25 20:05-07'),
  ('Load the spring cohort into the fellows module: names, schools, mentors, notes',
   null, 'acceptance',
   'Accepted. First real data in the hub, and it is clean. This is the moment BloomOS stopped being a demo.',
   null, '2026-06-26 08:15-07'),
  ('Enter the summer partner list into the partners module, one line on where each relationship stands',
   'remisobo@gmail.com', 'submission',
   'Nineteen partners in with a status line each. Three I genuinely do not know where things stand; marked those with a question mark for Thursday.',
   null, '2026-07-10 22:40-07'),
  ('Move the mentor match notes out of the old drive and into the fellows records',
   'shannonsfair@gmail.com', 'blocked',
   'The old drive folder is owned by an account we no longer have the password for. I can see the files but not move them. Need a minute on this Thursday.',
   null, '2026-07-08 18:20-07'),
  ('Move the mentor match notes out of the old drive and into the fellows records',
   null, 'comment',
   'Good catch, and not your block to clear alone. Added it to Thursday''s list; worst case we copy out by hand on a shared screen, 30 minutes.',
   null, '2026-07-09 07:50-07')
) as v(item, client_email, kind, body, link, at)
where not exists (select 1 from homework_activity h, e where h.engagement_id = e.id);

-- 8. Deliverables: the shipped record, one accepted, one pending -----

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
ws as (select w.title, w.id from workstreams w, e where w.engagement_id = e.id),
ses as (select s.starts_at::date as day, s.id from sessions s, e where s.engagement_id = e.id),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into deliverables
  (engagement_id, practice_id, client_id, workstream_id, session_id, title, kind, url,
   about_md, note, delivered_on, created_by, created_at)
select e.id, e.practice_id, e.client_id,
       (select id from ws where title = v.ws),
       (select id from ses where day = v.session_day::date),
       v.title, 'link', v.url, v.about, v.note, v.delivered::date,
       (select user_id from remi), (v.delivered || ' 15:00-07')::timestamptz
from e, (values
  ('Site map and page plan',
   'https://docs.google.com/document/d/1aa-sitemap-page-plan-demo/view',
   'Every page, its one job, and the content each page needs from the team. This is the contract the build follows.',
   null, 'The new website', '2026-03-26', '2026-03-26'),
  ('Design direction: type, color, and imagery',
   'https://docs.google.com/presentation/d/1aa-design-direction-demo/view',
   'The look the site ships with: the type pair, the palette pulled from the photos the team chose, and the rule that real moments beat posed shots.',
   null, 'The new website', '2026-04-09', '2026-04-09'),
  ('The data map: every spreadsheet and where it lands',
   'https://docs.google.com/spreadsheets/d/1aa-data-map-demo/view',
   'The full inventory from Shannon''s list, each sheet marked keep, merge, or retire, with the BloomOS module each one lands in. The migration runs down this map in order.',
   null, 'The data comes home', '2026-05-14', '2026-05-14'),
  ('BloomOS walkthrough: the five modules on video',
   'https://docs.google.com/document/d/1aa-walkthrough-notes-demo/view',
   'The recorded walkthrough and its notes: programs, fellows, partners, money, board, each shown against a real task. Watch before the build-list session; margin notes welcome.',
   null, 'BloomOS, the custom build', '2026-05-28', '2026-05-28'),
  ('The new ambitionangels.org, live',
   'https://ambitionangels.org',
   'The new site, live and owned outright: repo, domain, and content all under Ambition Angels. The homepage leads with the fellows; every page has one job. The punch list runs two weeks in the open.',
   'Launched on the day of the review session.', 'The new website', '2026-06-04', '2026-06-04'),
  ('Fellows module, live with the spring cohort',
   'https://docs.google.com/document/d/1aa-fellows-module-notes-demo/view',
   'The fellows module holding all 34 spring fellows: mentors beside fellows on one screen, the cohort view, and the notes that used to live in three places. The first module where the hub holds the real thing, not a copy.',
   null, 'BloomOS, the custom build', '2026-06-25', '2026-06-25'),
  ('Board view, first cut',
   'https://docs.google.com/document/d/1aa-board-view-first-cut-demo/view',
   'What a board member sees on sign-in: programs at a glance, the money picture, the fellows count with the story behind it. Read only, on purpose, per the June 25 decision. First cut for the team''s eyes before the board''s.',
   null, 'BloomOS, the custom build', '2026-07-09', '2026-07-08')
) as v(title, url, about, note, ws, session_day, delivered)
where not exists (select 1 from deliverables d, e where d.engagement_id = e.id);

-- The site acceptance (decided) and the board view ask (pending).
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1),
shannon as (
  select id from auth.users where lower(email) = 'shannonsfair@gmail.com' limit 1)
insert into approvals
  (practice_id, client_id, engagement_id, subject_type, subject_id, subject_label,
   requested_by, requested_at, status, decided_at, decided_by, decided_by_email, note_md, created_at)
select e.practice_id, e.client_id, e.id, 'deliverable', d.id, v.label,
       (select user_id from remi), v.requested::timestamptz,
       v.status,
       case when v.status = 'approved' then v.decided::timestamptz end,
       case when v.status = 'approved' then (select id from shannon) end,
       case when v.status = 'approved' then 'shannonsfair@gmail.com' end,
       v.note, v.requested::timestamptz
from e
join deliverables d on d.engagement_id = e.id
join (values
  ('The new ambitionangels.org, live', 'the new website, live',
   '2026-06-04 16:00-07', 'approved', '2026-06-08 09:20-07',
   'The site feels like us. We read it out loud in the office and nobody winced, which is the highest bar we have. Accepted, with thanks.'),
  ('Board view, first cut', 'the board view, first cut',
   '2026-07-09 15:30-07', 'pending', null, null)
) as v(title, label, requested, status, decided, note)
  on d.title = v.title
where not exists (
  select 1 from approvals a
  where a.subject_type = 'deliverable' and a.subject_id = d.id);

-- 9. Outcomes and their evidence -------------------------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
ws as (select w.title, w.id from workstreams w, e where w.engagement_id = e.id),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into outcomes
  (engagement_id, practice_id, client_id, workstream_id, title,
   baseline_md, target_md, standing_md, standing_updated_at, reached_on, sort, created_by, created_at)
select e.id, e.practice_id, e.client_id,
       (select id from ws where title = v.ws),
       v.title, v.baseline, v.target, v.standing,
       case when v.standing is not null then '2026-07-09 17:30-07'::timestamptz end,
       v.reached::date, v.sort, (select user_id from remi),
       '2026-03-12 16:00-07'::timestamptz
from e, (values
  ('A website that tells the story the way the team tells it',
   'The old site undersells the work; the team apologizes for it in meetings',
   'New ambitionangels.org live, owned outright, homepage led by the fellows',
   'Live since June 4; punch list cleared June 25. The team now sends the link without a caveat, which was the whole point.',
   '2026-06-04', 0, 'The new website'),
  ('One hub holding programs, fellows, partners, money, and the board',
   'The work lives in a dozen spreadsheets only two people can read',
   'All five BloomOS modules live with real data',
   'Four of five modules carrying real data as of July 9; the board view is in first cut and in front of the team now.',
   null, 1, 'BloomOS, the custom build'),
  ('The week runs out of BloomOS, not out of spreadsheets',
   'Every weekly task starts by opening a spreadsheet',
   'The team reaches for the hub first; the data map''s keep-merge-retire list fully worked',
   'The fellows records are home. Partners are in review; the mentor match notes are the last fellows data outside the hub.',
   null, 2, 'The data comes home'),
  ('The board sees the work without waiting for a meeting',
   'Board updates are assembled by hand before each meeting',
   'Board login live, read only, showing programs, money, and fellows honestly',
   null, null, 3, 'BloomOS, the custom build'),
  ('Shannon and the team run all of it without us',
   'The consultant is in the loop on every change',
   'A full week run in the hub with no consultant touch; handoff complete with everything owned in perpetuity',
   'Training block starts July 16. The freeze on August 1 makes the last two months about exactly this.',
   null, 4, 'Run it without us')
) as v(title, baseline, target, standing, reached, sort, ws)
where not exists (select 1 from outcomes o, e where o.engagement_id = e.id);

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
o as (select o.title, o.id from outcomes o, e where o.engagement_id = e.id),
d as (select d.title, d.id from deliverables d, e where d.engagement_id = e.id),
ai as (select a.title, a.id from action_items a, e where a.engagement_id = e.id),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into outcome_evidence
  (outcome_id, engagement_id, practice_id, client_id, kind, ref_id, note, added_by, created_at)
select (select id from o where title = v.outcome), e.id, e.practice_id, e.client_id,
       v.kind, v.ref_id, v.note, (select user_id from remi), v.at::timestamptz
from e, lateral (values
  ('A website that tells the story the way the team tells it', 'deliverable',
   (select id from d where title = 'The new ambitionangels.org, live'),
   'The site itself, live and accepted.', '2026-06-08 10:00-07'),
  ('One hub holding programs, fellows, partners, money, and the board', 'deliverable',
   (select id from d where title = 'Fellows module, live with the spring cohort'),
   'The first module holding the real thing.', '2026-06-26 09:00-07'),
  ('One hub holding programs, fellows, partners, money, and the board', 'deliverable',
   (select id from d where title = 'Board view, first cut'),
   null, '2026-07-09 17:00-07'),
  ('The week runs out of BloomOS, not out of spreadsheets', 'deliverable',
   (select id from d where title = 'The data map: every spreadsheet and where it lands'),
   'The map the migration runs down.', '2026-05-15 09:00-07'),
  ('The week runs out of BloomOS, not out of spreadsheets', 'action_item',
   (select id from ai where title = 'Load the spring cohort into the fellows module: names, schools, mentors, notes'),
   'The cohort entered and accepted; first data home.', '2026-06-26 09:05-07'),
  ('The board sees the work without waiting for a meeting', 'deliverable',
   (select id from d where title = 'Board view, first cut'),
   'First cut, in front of the team for acceptance.', '2026-07-09 17:05-07')
) as v(outcome, kind, ref_id, note, at)
where v.ref_id is not null
  and not exists (select 1 from outcome_evidence x, e where x.engagement_id = e.id);

-- 10. Readiness: the three pillars and their receipts ----------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1)
insert into readiness_markers (engagement_id, practice_id, client_id, pillar, note_md, updated_at)
select e.id, e.practice_id, e.client_id, v.pillar, v.note, '2026-07-09 17:45-07'::timestamptz
from e, (values
  ('philosophy',
   'Do they see the site and the hub as one thing, the story and the work? Mostly yes. Shannon talks about BloomOS as "where the truth lives" unprompted, which is the sentence I would have scripted. The second seat still frames it as software to learn rather than the way the org runs; the training block is built to close that.'),
  ('system',
   'Is the hub the real system of record? Fellows yes, partners nearly, money entered together on the 23rd. The data map is the honest checklist: everything marked keep or merge has a home; the retire list dies with the old drive.'),
  ('execution',
   'Are they in it weekly without prompting? Evidence is history: homework lands on time or early from Shannon, a day late but complete from the second seat. The real test starts July 16 when the sessions become their hands on the keys.')
) as v(pillar, note)
on conflict (engagement_id, pillar) do nothing;

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
d as (select d.title, d.id from deliverables d, e where d.engagement_id = e.id),
ai as (select a.title, a.id from action_items a, e where a.engagement_id = e.id),
ses as (select s.starts_at::date as day, s.id from sessions s, e where s.engagement_id = e.id),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into readiness_evidence
  (engagement_id, practice_id, client_id, pillar, kind, ref_id, note, added_by, created_at)
select e.id, e.practice_id, e.client_id, v.pillar, v.kind, v.ref_id, v.note,
       (select user_id from remi), '2026-07-09 17:50-07'::timestamptz
from e, lateral (values
  ('system', 'deliverable',
   (select id from d where title = 'The data map: every spreadsheet and where it lands'),
   'The keep-merge-retire list is the system test in one page.'),
  ('execution', 'action_item',
   (select id from ai where title = 'Load the spring cohort into the fellows module: names, schools, mentors, notes'),
   'Full review loop run and accepted: submitted, sent back once, fixed in two days.'),
  ('execution', 'session',
   (select id from ses where day = date '2026-07-09'),
   'Shaped the freeze and the training block themselves; I mostly held the pen.')
) as v(pillar, kind, ref_id, note)
where v.ref_id is not null
  and not exists (select 1 from readiness_evidence x, e where x.engagement_id = e.id);

-- 11. The why-we-are-here line under each arc ------------------------

with e as (
  select id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1)
update workstreams w
set note_md = v.note, note_updated_at = '2026-07-09 18:00-07'::timestamptz
from e, (values
  ('The new website',
   'Done and owned. The story now reads the way the team tells it; this arc closed June 25.'),
  ('BloomOS, the custom build',
   'All five modules stand. July is final touches; August 1 the building stops and the running starts.'),
  ('The data comes home',
   'The map is the checklist. Fellows are home, partners nearly, money on the 23rd, and the old drive retires last.'),
  ('Run it without us',
   'The point of the whole thing. Training block July 16 through August; handoff means owned, understood, and habitual.')
) as v(title, note)
where w.engagement_id = e.id and w.title = v.title and w.note_md is null;

-- 12. The one thread and four months of messages ---------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1)
insert into message_threads (engagement_id, practice_id, client_id, created_at, last_message_at)
select e.id, e.practice_id, e.client_id,
       '2026-03-12 12:00-07'::timestamptz, '2026-07-10 21:15-07'::timestamptz
from e
on conflict (engagement_id) do nothing;

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
t as (select id from message_threads where engagement_id = (select id from e)),
remi_p as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1),
shannon_c as (select id from auth.users where lower(email) = 'shannonsfair@gmail.com' limit 1),
remi_c as (select id from auth.users where lower(email) = 'remisobo@gmail.com' limit 1),
board_view as (
  select d.id from deliverables d, e
  where d.engagement_id = e.id and d.title = 'Board view, first cut' limit 1)
insert into messages
  (thread_id, engagement_id, practice_id, client_id, author_user_id, author_side,
   body, anchor_type, anchor_id, anchor_label, created_at, read_at)
select (select id from t), e.id, e.practice_id, e.client_id,
       case v.author
         when 'remi_p' then (select user_id from remi_p)
         when 'shannon' then (select id from shannon_c)
         else (select id from remi_c)
       end,
       case when v.author = 'remi_p' then 'practice' else 'client' end,
       v.body,
       case when v.anchored then 'deliverable' end,
       case when v.anchored then (select id from board_view) end,
       case when v.anchored then 'Board view, first cut' end,
       v.at::timestamptz,
       case when v.unread then null else (v.at::timestamptz + interval '4 hours') end
from e, (values
  ('remi_p', '2026-03-12 12:00-07', false, false,
   'Welcome to the room. Everything about this engagement lives here: sessions, homework, what we ship, and this thread. If you are wondering where something is, ask here and the answer will usually be a link.'),
  ('shannon', '2026-03-13 08:45-07', false, false,
   'Charter read and signed. We are ready. First homework question: does the one-page story want the version I tell funders or the version I tell parents? They are different stories.'),
  ('remi_p', '2026-03-13 10:10-07', false, false,
   'The parents version. Funders read that one and believe it; the reverse is not true. Write it warm and we will tune it later.'),
  ('remi_c', '2026-04-08 21:30-07', false, false,
   'Photos are in the folder. Fourteen, not twelve; could not cut the last two. The one from the spring showcase with the whiteboard is non-negotiable.'),
  ('remi_p', '2026-04-09 08:05-07', false, false,
   'Fourteen accepted, and the whiteboard one is going on the homepage. See you at ten.'),
  ('shannon', '2026-06-04 13:20-07', false, false,
   'It is LIVE and I have goosebumps. Sent it to the whole board before lunch. Thank you for making us look like who we actually are.'),
  ('remi_p', '2026-06-04 14:00-07', false, false,
   'It was all there already; we just cleared the path. Punch list is open for two weeks, so send every crooked pixel you find.'),
  ('shannon', '2026-07-09 16:10-07', true, false,
   'Walked the board view again after the call. Two asks before the board sees it: can the fellows count show the cohort split, and can we soften the grants chart title? "Pipeline" sounds like we run a sales floor.'),
  ('remi_p', '2026-07-09 17:20-07', false, false,
   'Both, yes. Cohort split lands this week; the chart title becomes "Where the grants stand", your words from the May walkthrough. The acceptance ask on the board view is open whenever the team is ready, no rush before the 16th.'),
  ('shannon', '2026-07-10 21:15-07', false, true,
   'Fall calendar is half drafted for Thursday. One thing I keep circling: September has three program starts in one week and I do not think we can staff it. Can we look at that together before I finish the draft?')
) as v(author, at, anchored, unread, body)
where not exists (select 1 from messages m where m.thread_id = (select id from t));

-- 13. The digest archive: ten sent Fridays ---------------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
insert into digests
  (engagement_id, practice_id, client_id, week_of, subject, draft_md, status,
   approved_by, approved_at, sent_at)
select e.id, e.practice_id, e.client_id, v.week_of::date, v.subject, v.body, 'sent',
       (select user_id from remi),
       (v.sent || ' 14:50-07')::timestamptz, (v.sent || ' 15:00-07')::timestamptz
from e, (values
  ('2026-03-16', '2026-03-20', 'The week: the map is drawn',
   $d$**Held this week.** The site architecture session: every page got one job, and the homepage's job is the fellows.

**Moving.** The site map and page plan are drafting toward next Thursday's sign-off.

**On you.** Shannon's one-page story is due April 2. Write it the way you tell it, not the way websites talk.

**Next.** Thursday at ten: site map sign-off and the content plan.$d$),
  ('2026-03-30', '2026-04-03', 'The week: the story goes to work',
   $d$**Shipped.** The site map and page plan, signed off Thursday. The build now has its contract.

**Landed.** Shannon's one-page story came in a day early and it is the About page's spine almost untouched.

**On you.** Twelve photos that feel like us, due April 9. Real moments over posed shots.

**Next.** Thursday: the homepage story session.$d$),
  ('2026-04-13', '2026-04-17', 'The week: BloomOS enters the room',
   $d$**Held.** BloomOS discovery. The rule that will shape everything: the spreadsheets name the modules. Whatever the team touches weekly becomes a module; nothing else does.

**Shipped last week.** Design direction: the type pair, the palette pulled from your own photos.

**On you.** The spreadsheet inventory, due April 23: who owns each one, how often, what breaks.

**Next.** Thursday: staging walkthrough. The site becomes clickable.$d$),
  ('2026-04-27', '2026-05-01', 'The week: the site stands up',
   $d$**Held.** The staging walkthrough. The site exists, the story reads, and the team found exactly the right things to push on.

**Landed.** The spreadsheet inventory, two days early. Eleven sheets, three owners, and an honest list of what breaks.

**Next.** Thursday May 7: the BloomOS module map. The inventory becomes the blueprint.$d$),
  ('2026-05-11', '2026-05-15', 'The week: five modules, no more',
   $d$**Decided.** BloomOS v1 is five modules: programs, fellows, partners, money, board. Everything else is a change order, named now so asking later is easy.

**Shipped.** The data map: every spreadsheet marked keep, merge, or retire, with its landing place in the hub.

**Next.** Content week. The team loads the site themselves; freeze after for launch.$d$),
  ('2026-05-25', '2026-05-29', 'The week: the hub walks',
   $d$**Held.** The full BloomOS walkthrough: all five modules against real tasks from your week. Two honest findings went straight to the build list, including the mentor-beside-fellow screen.

**Decided.** Grant stages take your language: exploring, asked, promised, received, reported.

**Next.** Launch week. The new ambitionangels.org goes live Thursday.$d$),
  ('2026-06-01', '2026-06-05', 'The week: the site is live',
   $d$**Shipped.** The new ambitionangels.org, live Thursday and sent to the board before lunch. Owned outright: repo, domain, content.

**Decided.** Launch now, polish in public. The punch list runs two weeks in the open.

**On you.** The acceptance ask on the site is open; take it whenever the team is ready.

**Next.** Thursday: punch list and the fellows records start moving home.$d$),
  ('2026-06-15', '2026-06-19', 'The week: real data comes home',
   $d$**Held.** The fellows module working session. The import sheet is in Shannon's hands; the spring cohort moves in this week.

**Landed.** The site acceptance: signed June 8, with the best acceptance note this practice has received.

**On you.** The spring cohort load, due June 25.

**Next.** Thursday: fellows module review, and handoff planning opens.$d$),
  ('2026-06-29', '2026-07-03', 'The week: the hub holds the real thing',
   $d$**Shipped.** The fellows module, live with all 34 spring fellows. Submitted, sent back once for eight school years, fixed in two days, accepted. The hub now holds the real thing, not a copy.

**Decided.** The board view ships read only in v1. The board sees everything and touches nothing, on purpose.

**Quiet week ahead.** No session July 2; back Thursday the 9th with the board view first cut.$d$),
  ('2026-07-06', '2026-07-10', 'The week: the last two months take shape',
   $d$**Shipped.** The board view, first cut: programs at a glance, the money picture, the fellows count. The acceptance ask is open.

**Decided.** Feature freeze August 1. Months five and six are training and handoff, not new builds.

**On you.** The fall calendar draft (Thursday) and three real tasks to run live in the hub. The partner list is in review now.

**Next.** July 16: training begins. Your hands on the keys, ours in our pockets.$d$)
) as v(week_of, sent, subject, body)
on conflict (engagement_id, week_of) do nothing;

-- 14. A few notifications, so New-for-you is honest ------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
cm as (
  select lower(email) as email, id from client_members
  where client_id = (select client_id from e)),
pm as (
  select id from practice_members
  where lower(email) = 'remi@ambitionangels.org' limit 1)
insert into notifications
  (practice_id, client_id, engagement_id, recipient_client_member_id,
   recipient_practice_member_id, kind, title, href, dedupe_key, created_at, read_at)
select e.practice_id, e.client_id, e.id,
       (select id from cm where email = v.client_email),
       case when v.client_email is null then (select id from pm) end,
       v.kind, v.title, v.href, v.dedupe, v.at::timestamptz,
       case when v.unread then null else (v.at::timestamptz + interval '1 day') end
from e, (values
  ('shannonsfair@gmail.com', 'homework_feedback',
   'Your cohort load was accepted', '/homework', 'aa-demo:hw-accept:shannon',
   '2026-06-26 08:15-07', false),
  ('shannonsfair@gmail.com', 'deliverable_shipped',
   'New from your consultant: Board view, first cut', '/deliverables',
   'aa-demo:deliv-board:shannon', '2026-07-08 15:05-07', true),
  ('remisobo@gmail.com', 'deliverable_shipped',
   'New from your consultant: Board view, first cut', '/deliverables',
   'aa-demo:deliv-board:remi', '2026-07-08 15:05-07', true),
  ('shannonsfair@gmail.com', 'approval_waiting',
   'The board view is ready for your acceptance', '/deliverables',
   'aa-demo:approval-board:shannon', '2026-07-09 15:30-07', true),
  ('remisobo@gmail.com', 'approval_waiting',
   'The board view is ready for your acceptance', '/deliverables',
   'aa-demo:approval-board:remi', '2026-07-09 15:30-07', true),
  (null, 'homework_submitted',
   'Partner list submitted for review', '/engagements', 'aa-demo:hw-submit:partners',
   '2026-07-10 22:40-07', true)
) as v(client_email, kind, title, href, dedupe, at, unread)
on conflict (dedupe_key) do nothing;

-- 15. Prep on the next session ----------------------------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Ambition Angels')
  limit 1),
s as (
  select s.id from sessions s, e
  where s.engagement_id = e.id and s.starts_at::date = date '2026-07-16' limit 1),
r as (
  select r.id from resources r
  join practices p on p.id = r.practice_id and p.slug = 'sobo'
  where r.title = 'AI in the daily workflow' limit 1)
insert into session_prep_resources (session_id, resource_id, practice_id, client_id, created_at)
select (select id from s), (select id from r), e.practice_id, e.client_id,
       '2026-07-09 18:10-07'::timestamptz
from e
where (select id from s) is not null and (select id from r) is not null
  and not exists (
    select 1 from session_prep_resources x
    where x.session_id = (select id from s) and x.resource_id = (select id from r));
