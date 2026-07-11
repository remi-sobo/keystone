-- Keystone pilot seed: the SafeSpace engagement content.
-- Source of truth: docs/seed/keystone-safespace-seed.md (the proposal,
-- the recap email, and the July 7 working call). Run ONCE against the
-- real project after seed.sql; idempotent throughout, safe to re-run.
--
-- What this does, per the seed doc section 13 and the V2 spec Phase 0:
--   1. Retitles the engagement to the proposal's title and sets the
--      six-month end date.
--   2. Renames the five spec-seeded workstreams to the proposal's four
--      (V1 CONFIRM 5, resolved by the client-approved proposal). The
--      fundraising strategy work folds into workstream 1, so the fifth
--      seeded row is removed when nothing references it.
--   3. Enters the July 7 working call and its decision log as shared
--      session notes. Decision 11 carries the fee by reference; the
--      number itself lives in the charter, per fee gate 9 / V2-6
--      (decided 2026-07-09: charter only, nowhere else).
--   4. Seeds the homework starters, the readiness marker notes, the
--      charter draft and planned-deliverables ledger as pinned library
--      resources, and the nine resource library starters.
--
-- FLAGS (also in CURRENT.md):
--   - The July 7 call's hour is not in the record; noon Pacific below
--     is a placeholder for Remi to correct.
--   - V1 deliverables holds shipped artifacts only (kind file or link),
--     so the PLANNED ledger lives as a pinned resource until V2 3D.

-- 1. Engagement title and end date -----------------------------------

update engagements
set title = 'Systems and leaders: fundraising first',
    ends_on = coalesce(ends_on, (starts_on + interval '6 months')::date)
where client_id = (select id from clients where name = 'SafeSpace')
  and title = 'SafeSpace and Sobo Consulting';

-- Fee gate (V1 gate 9 / V2-6, decided 2026-07-09): the fee shows in the
-- charter, nowhere else in the app. fee_display feeds the charter
-- surface when 2A ships.
update engagements
set fee_display = '$25,000, one fee, all four workstreams'
where client_id = (select id from clients where name = 'SafeSpace')
  and fee_display is null;

-- 2. Workstreams: the proposal's four, in its exact language ----------

with e as (
  select id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
)
update workstreams w set title = v.new_title, sort = v.new_sort
from e, (values
  ('The operating hub',                        'Build the system',     0),
  ('Leadership development, Aris and Jasmine', 'Develop the leaders',  1),
  ('Impact and evaluation',                    'Show the impact',      2),
  ('Back office',                              'Hold the back office', 3)
) as v(old_title, new_title, new_sort)
where w.engagement_id = e.id and w.title = v.old_title;

-- The fifth seeded row folds into 'Build the system'. Remove it only
-- while untouched: still in diagnose, nothing pointing at it.
delete from workstreams w
where w.title = 'Fundraising system and rhythms'
  and w.stage = 'diagnose'
  and not exists (select 1 from action_items a where a.workstream_id = w.id)
  and not exists (select 1 from deliverables d where d.workstream_id = w.id)
  and not exists (select 1 from workstream_stage_events s where s.workstream_id = w.id);

-- 3. The July 7 working call and its decision log ---------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
)
insert into sessions (engagement_id, practice_id, client_id, starts_at, ends_at, tz, kind, status)
select e.id, e.practice_id, e.client_id,
       '2026-07-07 12:00-07'::timestamptz, '2026-07-07 13:00-07'::timestamptz,
       'America/Los_Angeles', 'working', 'held'
from e
where not exists (
  select 1 from sessions s where s.engagement_id = e.id
    and s.starts_at::date = date '2026-07-07'
);

with s as (
  select s.id, s.engagement_id, s.practice_id, s.client_id from sessions s
  where s.starts_at::date = date '2026-07-07'
    and s.client_id = (select id from clients where name = 'SafeSpace')
  limit 1
)
insert into session_notes (session_id, engagement_id, practice_id, client_id, summary_md, decisions_md, visibility)
select s.id, s.engagement_id, s.practice_id, s.client_id,
$md$Working call, Remi and Susan, ahead of the engagement decision. The proposal was walked end to end: the four workstreams, the six outcomes, cadence, ownership, and what sits outside scope. The decisions below are the engagement's opening record.$md$,
$md$1. Fundraising first. The build and coaching order. (Proposal; confirmed on call, Jul 7.)
2. Start now, front-load month one at twice weekly while program is slow, ahead of the season. (Call, Jul 7; recap email.)
3. SafeSpace owns everything in perpetuity. Custom build; databases and AI programs included. (Call, Jul 7, direct answer to Susan.)
4. SafeSpace pauses its other software purchase contingent on this engagement going ahead. (Call, Jul 7, Susan.)
5. Liesl moves to advisory and is used deliberately: assigned relationships, drafted letters, made easy. (Call, Jul 7; recap email.)
6. Susan stays in: strategizes existing donors, sits in selected meetings, brings the coachees on real calls. Not exiting. (Call, Jul 7.)
7. Reps model: Aris and Jasmine go on calls with Susan or Liesl first; Remi joins selected calls at SafeSpace's request. (Call, Jul 7; Susan's follow-up note.)
8. Cadence set month by month, not fixed for six months upfront. (Call, Jul 7.)
9. Collateral set: pitch deck, send deck, one-pager; website named the fourth artifact and held as a separate engagement. (Call, Jul 7.)
10. Segmentation approach: custom strategies for the top tier, simple letter and giving-tree campaigns below. (Call, Jul 7, Susan and Remi together.)
11. Fee accepted as proposed, one fee for all four workstreams, without negotiation, pending Aris and Jasmine's full buy-in; answer promised by Wednesday night or Thursday morning. (Call, Jul 7, Susan. The number lives in the charter, per the fee gate.)
12. Weekly pitch practice as a standing rhythm from the start. (Call, Jul 7.)
13. Go/no-go rests on the coachees: Susan wanted them 150 percent behind it before saying yes. (Call, Jul 7.)$md$,
'shared'
from s
where not exists (select 1 from session_notes n where n.session_id = s.id);

-- 4. Homework starters (seed doc section 7) ---------------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
),
ws as (
  select w.title, w.id from workstreams w, e where w.engagement_id = e.id
),
cm as (
  select lower(email) as email, id from client_members
  where client_id = (select client_id from e)
),
pm as (
  select id from practice_members
  where lower(email) = 'remi@ambitionangels.org' limit 1
)
insert into action_items (engagement_id, practice_id, client_id, workstream_id,
  title, assigned_client_member_id, assigned_practice_member_id, timing, source)
select e.id, e.practice_id, e.client_id,
       (select id from ws where title = v.ws),
       v.title,
       (select id from cm where email = v.client_email),
       case when v.internal then (select id from pm) end,
       v.timing, 'manual'
from e, (values
  ('Map the top ten donors and bring them to an early session: who they are, why they give, connections, giving history, which stewardship has landed',
   'Build the system', 'susan@safespace.org', false, 'before_session'),
  ('Weekly five-minute pitch practice: pitch Jasmine once each week, starting this week, even before the deck exists',
   'Develop the leaders', 'aris@safespace.org', false, 'standing'),
  ('Weekly five-minute pitch practice: pitch Aris once each week, starting this week, even before the deck exists',
   'Develop the leaders', 'jasmine@safespace.org', false, 'standing'),
  ('Draft the narrative frame, ten years in and here is the next ten: the two-sentence version and the fuller version, with messaging angles for the team to react to',
   'Develop the leaders', null, true, 'standing'),
  ('Backwards plan from the three-year picture: the annual budget at sustainability, and what this year needs to raise',
   'Build the system', null, false, 'standing'),
  ('Ten-year kickoff newsletter: facts-led with positive framing always, simple letters and a giving-tree play for the low-giving segment',
   'Build the system', null, false, 'standing')
) as v(title, ws, client_email, internal, timing)
where not exists (
  select 1 from action_items a where a.engagement_id = e.id and a.title = v.title
);

-- 5. Readiness marker notes (seed doc section 5) ----------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
)
insert into readiness_markers (engagement_id, practice_id, client_id, pillar, note_md)
select e.id, e.practice_id, e.client_id, v.pillar, v.note
from e, (values
  ('philosophy',
   'Do they understand how fundraising and nonprofit leadership actually work? On Remi. Includes: the nonprofit as a business with a double bottom line (impact and dollars); stewardship versus cultivation, both every week; donor journeys where the ask is never a surprise; foundations operate differently than individuals; the elevation from program leader to nonprofit executive.'),
  ('system',
   'Do they have a documented plan and system a professional would respect? On Remi. Week, month, quarter, year rhythms; the gift table; segmented strategies; the hub as the daily home.'),
  ('execution',
   'Are they running it consistently, week to week? On them, and the one thing no one can do for them. Evidence is history: rhythm sessions held, homework done, reps run.')
) as v(pillar, note)
on conflict (engagement_id, pillar) do nothing;

-- 6. The charter draft and the planned-deliverables ledger, pinned ----
-- Both live as library resources until V2 2A (Charter) and 3D
-- (deliverable lifecycle) give them first-class homes. The library is
-- practice-wide in V1; with one client that is acceptable for the
-- pilot, and V2 3F adds client-specific visibility.

with p as (select id from practices where slug = 'sobo')
insert into resources (practice_id, title, kind, body_md, tags)
select p.id,
  'Engagement charter, draft: Systems and leaders, fundraising first',
  'guide',
$charter$This is the shared agreement for the SafeSpace engagement, drafted from the proposal, the recap email, and the July 7 call. It graduates to a first-class charter when that surface ships.

## Why this engagement exists
The first ten years were liftoff. SafeSpace built a fundraising engine, a real financial picture, an active board, deep roots in San Mateo County, and impact in the lives of young people through Campus, Community, and the Youth Action Board. The next ten are about sustainability: an organization rooted in this community and built to stay. This engagement is that investment. It is usually not the heart. It is the system.

## What we are building
Over six months, Sobo Consulting brings SafeSpace's systems into one customized hub, builds a full fundraising strategy with the weekly rhythms to run it, and develops Aris and Jasmine to lead fundraising and operate like nonprofit executives. Fundraising first. The board joins the fundraising work deliberately: a board fundraising toolkit and up to two working sessions so members can identify connections, make introductions, and support donor cultivation. The engagement runs six months at one fee, $25,000, covering all four workstreams.

## Where this ends (the six outcomes)
1. A full fundraising strategy, the internal rhythms to run it, and a digital tool built around how SafeSpace operates, from prospecting through cultivation, solicitation, and stewardship, with a major donor component covering prospect identification, cultivation, and solicitation.
2. The financial picture in a live dashboard, with a board login and views the board controls.
3. Compliance and HR streamlined and solid, including the protections that come with working with minors.
4. Operating rhythms that hold the week, the month, and the quarter.
5. Aris and Jasmine running all of it with confidence and without us, fully onboarded into the hub.
6. An impact and evaluation framework and the funder-ready artifacts to track and showcase it.

## How we will work
Two modes at once: develop the people and build the system, then set it up to last. Five steps: Diagnose, Design, Build, Train, Stabilize. Every session is a working session with homework before and after, always tied to a real fundraising task. Each session adds one piece of the system, so by the end Aris and Jasmine are running something they built. Ownership transfers as they build it, not in one handoff at the end. Plan on four to six hours a week from each coachee: the session, the homework, and implementation time. Expect six to eight in the first month, when sessions run twice a week and the work is front-loaded. Treat it like training. These are estimates for planning, not requirements.

## What you own at the end
All of it, once the engagement completes and the fee is paid in full. The hub is a custom build and SafeSpace owns it moving forward: strategy and goals, projects and tasks, a full CRM with donor and grant pipelines, and areas for program, finance, data, and compliance. A board login SafeSpace controls. The fundraising collateral built together: a pitch deck, a send deck, and a one-pager. SafeSpace can export everything, the hub's data and this engagement record, in commonly used formats at any time, whether or not support continues. Sobo Consulting keeps its general methods, frameworks, and tools, and SafeSpace holds a perpetual, non-exclusive license to use any of them that ship inside the delivered system for its internal operations. Remi stays available as a resource afterward, shape to be decided together.

## Hosting and what happens after
The first twelve months of hosting, maintenance, security updates, and support are included in the fee, starting the day the hub goes live. After that, SafeSpace can continue on a published BloomOS plan, month to month, cancel any time. Its plan is Bloom Grow, currently $250 a month, held at that rate for five years from the end of the included year. If SafeSpace chooses not to continue, it keeps its license and its data, receives a full export, and gets help moving to another system. It is never locked in by its own data.

## Roles
- Remi coaches the leadership and builds the system.
- Dr. Kendra designs the impact and evaluation framework and the funder-facing artifacts.
- Shannon holds the back office steady while the team learns to run it.
- Susan stays close to the day to day, strategizes on existing donors, sits in on selected sessions, and brings Aris and Jasmine onto real calls.
- Liesl moves toward an advisory seat. Her relationships are used deliberately: specific people assigned, letters drafted for her, made as easy as possible.
- Aris and Jasmine do the work: homework, reps, rhythms, and, increasingly, the calls. Execution is theirs, and it is the part no one can do for them.

## How we will know it worked
Three things, checked honestly: philosophy (they understand how fundraising and nonprofit leadership actually work), system (a documented plan a professional fundraiser would respect), and execution (they are running it consistently, week to week). Stabilized means all three are true and running without us. The test: if a new person joined, they could pick up the system and run the play. If any piece needs more time at six months, Remi stays on as a resource until it holds. Nothing gets dropped at the finish line.

## What this engagement is not
- It is not a quick fundraising sprint. The goal is capability that lasts, and more raised along the way is the expected byproduct, not the deliverable.
- The Youth Action Board portal, a public website redesign, and ongoing support beyond the six months are available as separate engagements, scoped on their own. They are named here so asking about them is easy and never awkward.
- Program design stays with the program team. Fundraising touches every function, so we will talk about all of it, but this engagement does not run programs.$charter$,
  array['safespace','charter']
from p
where not exists (
  select 1 from resources r, p
  where r.practice_id = p.id and r.title like 'Engagement charter, draft%'
)
-- Once the charter graduated to engagement_charters (2A,
-- seed-charter-v1.sql), the placeholder never comes back.
and not exists (
  select 1 from engagement_charters c
  where c.client_id = (select id from clients where name = 'SafeSpace')
);

with p as (select id from practices where slug = 'sobo')
insert into resources (practice_id, title, kind, body_md, tags)
select p.id,
  'Planned deliverables: the SafeSpace ledger',
  'guide',
$ledger$What this engagement will ship, by workstream. Each item becomes a deliverable row in the record as it ships; this ledger is the plan, kept here until planned deliverables have a first-class home.

**Build the system**
- Fundraising strategy and plan document, with a major donor component: prospect identification approach, cultivation and solicitation plans (named prospects live in the hub CRM, entered by SafeSpace)
- Annual fundraising calendar
- Case for support
- Donor templates: outreach, thank-you, and follow-up
- Donor pipeline and journeys live in the hub (hub milestone)
- Gift table and segmentation strategy
- Finance dashboard and board login (hub milestone)

**Develop the leaders**
- Pitch deck
- Send deck
- One-pager
- Narrative frame: the next ten years
- Board fundraising toolkit and introductions playbook

**Show the impact**
- Impact and evaluation framework
- Funder-ready impact artifacts

**Hold the back office**
- Compliance and HR foundations documented
- Operating rhythms documented for handoff (month 6)

The public website is deliberately not on this list: named on the call as the fourth fundraising artifact and explicitly held as a separate engagement. It is the first pre-named change order.$ledger$,
  array['safespace','ledger']
from p
where not exists (
  select 1 from resources r, p
  where r.practice_id = p.id and r.title = 'Planned deliverables: the SafeSpace ledger'
);

-- 7. Resource library starters (seed doc section 9, SOBO IP) ----------

with p as (select id from practices where slug = 'sobo')
insert into resources (practice_id, title, kind, body_md, tags)
select p.id, v.title, 'guide', v.body, v.tags
from p, (values
  ('Donor journeys',
   'Stewardship and cultivation, both every week. The ask is never a surprise. A quarterly touch cadence per donor.',
   array['fundraising']),
  ('How to run a fundraising meeting',
   'Prepare, execute, follow up, then debrief: likelihood, giving potential, possible ask.',
   array['fundraising']),
  ('The weekly fundraising rhythm',
   'What a week looks like. Planning the week around work blocks and priorities.',
   array['fundraising','rhythm']),
  ('Messaging angles',
   'The same true story told to different hearts: youth mental health; peer-led leadership development; community rootedness (the peninsula''s own kids, grandparent and parent framings). Accurate always, tuned per funder.',
   array['fundraising','narrative']),
  ('Segmenting the base',
   'The 90/10 cut. Custom strategies up top, letters and giving-tree below. Program-cost framing for community fundraising, larger funders for the rest.',
   array['fundraising','strategy']),
  ('Foundations versus individuals',
   'How institutional funders think, what they need, and how the ask differs.',
   array['fundraising']),
  ('Multi-year giving',
   'Moving a yearly gift to a three-year commitment, and when it is too early to push it.',
   array['fundraising']),
  ('AI in the daily workflow',
   'How to use it, how not to. It cleans up your thinking; you do the thinking. It drafts outreach, never sends on its own.',
   array['operations','ai']),
  ('Positive framing',
   'No failure language; a learning organization. Losses are lessons. Never signal instability to donors.',
   array['narrative','voice'])
) as v(title, body, tags)
where not exists (
  select 1 from resources r, p where r.practice_id = p.id and r.title = v.title
);
