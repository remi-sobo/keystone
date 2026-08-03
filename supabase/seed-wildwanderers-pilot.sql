-- Keystone pilot seed: the Wild Wanderers engagement content.
-- Source of truth: the session one call of 2026-07-27 (Remi and Gabe
-- Brewer, one hour on Zoom) and the two founding documents sent the
-- same day, WildWanderers_Business_Plan.pdf and
-- WildWanderers_SixMonth_Build.pdf. Run ONCE against the real project
-- after seed.sql; idempotent throughout, safe to re-run.
--
-- Wild Wanderers is the practice's second pilot client after SafeSpace.
-- The shape follows seed-safespace-pilot.sql: name-based lookups, no
-- hardcoded uuids, every insert guarded so a re-run never duplicates
-- and never clobbers a row Remi has since edited in the UI.
--
-- What this does:
--   1. The client, Gabe's client_member invite, and the client profile
--      carrying the dual-role disclosure.
--   2. The engagement: title, dates, the trade in fee_display, Remi as
--      owner.
--   3. The four workstreams, all owned by Remi.
--   4. Session one (held) and the standing Monday 2pm series through
--      2027-01-25, matching the Google Calendar recurring event.
--   5. The session one practice note (summary and decision log).
--   6. The fifteen decisions, the eight commitments, the seven
--      outcomes with their current standing, and the three readiness
--      markers.
--   7. The two shipped founding documents and the planned deliverable
--      ledger.
--   8. The coaching contract as a pinned library resource, linked to
--      session one.
--
-- FLAGS (also in CURRENT.md):
--   - The raw session one transcript (42,824 characters) is NOT in this
--     file, by SECURITY.md section 4. Transcripts are person-data and
--     belong in Storage behind the client wall, never in version
--     control. Load it out of band.
--   - Related: the live row currently holds that transcript INLINE in
--     session_notes.raw_transcript with transcript_path null, which
--     rule 4.1 says should be a pointer once a transcript is long.
--     Worth moving to Storage; not done here because this file only
--     reproduces seed state.
--   - engagement_phases (the six monthly pass conditions, M1 August
--     through M6 January) are NOT seeded. Their subtitles must carry
--     each month's pass condition verbatim from the six-month build
--     PDF, and that document was not readable when this file was
--     written. Do not paraphrase them into existence.
--   - The coaching contract resource is audience 'practice', not
--     'client'. resources has no client_id and resources_read admits
--     any client member of the practice to any audience='client' row,
--     so a client-audience copy would be readable by SafeSpace. Scope
--     the library per client before making it client-visible.
--   - starts_on is 2026-07-27, the day of session one, while the title
--     and the plan both say August to January. Left as the real date.

-- 1. The client, the contact, the profile ----------------------------

insert into public.clients (practice_id, name, status)
select p.id, 'Wild Wanderers', 'active'
from public.practices p
where not exists (select 1 from public.clients where name = 'Wild Wanderers');

insert into public.client_members (client_id, practice_id, email, role)
select c.id, c.practice_id, 'brewha07@gmail.com', 'client_member'
from public.clients c
where c.name = 'Wild Wanderers'
  and not exists (
    select 1 from public.client_members cm
    where cm.client_id = c.id and lower(cm.email) = 'brewha07@gmail.com'
  );

-- The dual-role disclosure lives here, the SafeSpace precedent (where
-- the board seat and its boundary are named in the same note). SOBO is
-- not a neutral advisor to this client and the record says so.
insert into public.client_profiles
  (client_id, practice_id, relationship_note, relationship_started_on, primary_contact_member_id)
select
  c.id,
  c.practice_id,
  'Wild Wanderers is a family business: Gabe Brewer coaching boys outdoors on the Baylands and adults across the peninsula, with Sarah holding operations and structure and the boys growing up in it. The engagement runs August to January toward the $20k gross month; the relationship opened with Gabe''s June 10 introduction email. Dual role, disclosed to Gabe in session one on July 27 and on the record here: SOBO is not a neutral advisor to this client. SOBO builds and holds a stake in the Wild Wanderers platform (the app, site, and enrollment engine) and also coaches the business that runs on it, so any platform recommendation carries SOBO''s own interest and gets said out loud before Gabe decides. No cash changes hands either way; the engagement is a trade of training for coaching.',
  date '2026-06-10',
  (select cm.id from public.client_members cm
     where cm.client_id = c.id and lower(cm.email) = 'brewha07@gmail.com' limit 1)
from public.clients c
where c.name = 'Wild Wanderers'
on conflict (client_id) do nothing;

-- 2. The engagement --------------------------------------------------

insert into public.engagements
  (practice_id, client_id, title, starts_on, ends_on, status, digest_cadence)
select c.practice_id, c.id, 'The six-month build: August to January',
       date '2026-07-27', date '2027-01-31', 'active', 'weekly'
from public.clients c
where c.name = 'Wild Wanderers'
  and not exists (
    select 1 from public.engagements e where e.client_id = c.id
  );

-- The engagement is a trade, not a cash fee. Naming the terms beats a
-- zero, which reads as "free" and loses what each side owes.
update public.engagements e
set fee_display = 'Trade: three training sessions a week for six months, for six months of coaching'
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and e.fee_display is null;

update public.engagements e
set owner_practice_member_id = (
      select pm.id from public.practice_members pm
      where lower(pm.email) = 'remi@ambitionangels.org' limit 1)
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and e.owner_practice_member_id is null;

-- 3. The four workstreams --------------------------------------------

insert into public.workstreams
  (engagement_id, practice_id, client_id, title, stage, sort, owner_practice_member_id)
select e.id, e.practice_id, e.client_id, v.title, 'diagnose', v.sort,
       (select pm.id from public.practice_members pm
          where lower(pm.email) = 'remi@ambitionangels.org' limit 1)
from public.engagements e, (values
  ('The pipeline',              0),
  ('The operation',             1),
  ('The money',                 2),
  ('Protection and the family', 3)
) as v(title, sort)
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and not exists (
    select 1 from public.workstreams w
    where w.engagement_id = e.id and w.title = v.title
  );

update public.workstreams w
set owner_practice_member_id = (
      select pm.id from public.practice_members pm
      where lower(pm.email) = 'remi@ambitionangels.org' limit 1)
where w.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and w.owner_practice_member_id is null;

-- 4. Sessions: session one, then the standing Monday 2pm series -------
-- Both carry the real Google Calendar recurring event id
-- (a3o35fm8navv628uotlscb83e4) so a calendar resync matches instead of
-- duplicating.
--
-- Note the timestamp construction: generate_series over ::timestamp
-- (NOT ::date, which yields timestamptz and makes AT TIME ZONE convert
-- an instant instead of interpreting a wall time). This way Postgres
-- resolves the Nov 1 DST shift itself: 21:00Z through Oct 26, 22:00Z
-- from Nov 2, matching the calendar exactly.

insert into public.sessions
  (engagement_id, practice_id, client_id, starts_at, ends_at, tz, location, kind, status, gcal_event_id)
select e.id, e.practice_id, e.client_id,
       s.starts_at, s.starts_at + interval '1 hour', 'America/Los_Angeles',
       'Zoom, https://us06web.zoom.us/j/5320728761', 'working',
       case when s.starts_at < timestamptz '2026-08-01' then 'held' else 'booked' end,
       'a3o35fm8navv628uotlscb83e4_' || to_char(s.starts_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"')
from public.engagements e,
     (select ((d + time '14:00') at time zone 'America/Los_Angeles') as starts_at
        from generate_series('2026-07-27'::timestamp, '2027-01-25'::timestamp, interval '7 days') as d
     ) s
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and not exists (
    select 1 from public.sessions x
    where x.engagement_id = e.id and x.starts_at = s.starts_at
  );

-- 5. The session one practice note -----------------------------------
-- summary and decision log only. raw_transcript is loaded out of band
-- (see FLAGS). session_notes is UNIQUE on session_id: one note per
-- session, with visibility as the switch.

insert into public.session_notes
  (session_id, engagement_id, practice_id, client_id, visibility, summary_md, decisions_md)
select s.id, s.engagement_id, s.practice_id, s.client_id, 'practice',
'The founding interview, Remi and Gabe, one hour on Zoom. The role shifted from builder to coach; the perfect Tuesday got defined in numbers (ten boys, seven-plus committed clients, the $20k gross month); the first job was named (pipeline, not program); the standing Monday 2pm rhythm was set; and the two founding documents were promised and delivered the same day. The decision log carries the shared record; the wall in the seed doc section 11 governs what stays practice-side.',
'1. The role shifts from builder to coach: Remi-led scope and sequence, weekly accountability, Gabe free to take the lead as things come up.
2. Two streams, one brand, family owned: the boys'' program and the fitness practice, both Wild Wanderers.
3. The finish line written down now: 10 boys, 7+ committed clients, 2 groups, a $20k gross month, Gabe on his own rhythm, by January.
4. $20k gross a month carries the family; today grosses about $8k; the build is a $12k bridge.
5. The first job is pipeline, not program: five real asks a week from week one.
6. The boys'' program is the mission and it also pays: a paying baseline funds scholarship spots.
7. Premium boutique positioning: about ten paying relationships run the model; clients treated like family; retention over volume.
8. Two pricing fixes in month one: the 12-pack reprices near $1,650; the $250 group rate holds for launch.
9. Growth comes from adding groups; new clients pay raised rates, founding clients keep their price.
10. Launch mid-September with the boys we have.
11. Protection closes before the first family enrolls.
12. The standing rhythm: Mondays 2pm, Sunday week design, the monthly family meeting with the books open, the monthly close.
13. Business conversations get recorded and sent in, family ones included.
14. The scorecard is the truth, and it lives in the Wild Wanderers app.'
from public.sessions s
where s.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and s.starts_at = timestamptz '2026-07-27 14:00:00 America/Los_Angeles'
  and not exists (select 1 from public.session_notes n where n.session_id = s.id);

-- 6. The record: decisions, commitments, outcomes, readiness ---------

insert into public.decisions
  (engagement_id, practice_id, client_id, workstream_id, session_id, decided_on, title, context_md, decided_by_label, source)
select e.id, e.practice_id, e.client_id,
       (select w.id from public.workstreams w where w.engagement_id = e.id and w.title = v.ws),
       (select s.id from public.sessions s where s.engagement_id = e.id order by s.starts_at limit 1),
       date '2026-07-27', v.title, v.context, v.who, 'manual'
from public.engagements e, (values
  ('The pipeline', 'Launch mid-September with the boys we have: six on the trail beats zero and a full waitlist; the cohort fills while the program runs.', 'Six-month build, month two.', 'Remi and Gabe'),
  ('The pipeline', 'The first job is pipeline, not program: the full sales engine gets built from the ground up, five real asks a week from week one.', 'Call, Jul 27 (no five families and no five clients can be named today); six-month build.', 'Remi and Gabe'),
  ('The operation', 'The scorecard is the truth: if it is not on the scorecard, it did not happen. It lives in the Wild Wanderers app, business side, built in month one.', 'Six-month build page 2.', 'Remi'),
  ('The operation', 'Premium boutique positioning: about ten paying relationships run the whole model, clients treated like family, retention over volume.', 'Call, Jul 27; business plan. Commitment is monthly recurring revenue.', 'Remi and Gabe'),
  ('The operation', 'The boys'' program is the mission and it also pays: a paying baseline funds scholarship spots, on mission always.', 'Call, Jul 27.', 'Gabe'),
  ('The money', 'Growth comes from adding groups, not stacking one-on-ones; new clients pay raised rates, founding clients keep their price.', 'Call, Jul 27; business plan year three.', 'Gabe and Remi'),
  ('The money', 'Two pricing fixes in month one: the 12-pack at $2,000 reprices near $1,650, and the $250 group rate holds for launch and rises as groups fill.', 'Call, Jul 27 (the pack as priced charges a premium for commitment); business plan page 4.', 'Remi'),
  ('The money', '$20k gross a month is the number where the business carries the family; today grosses about $8k, so the build is a $12k bridge.', 'Call, Jul 27; business plan page 4.', 'Gabe'),
  ('Protection and the family', 'Protection closes before the first family enrolls: LLC confirmed, insurance rated for outdoor youth work, waivers signed before day one, CPR current.', 'Call, Jul 27; the business plan protection plan. The structure is what the family reviews.', 'Remi and Gabe'),
  (null, 'Business conversations get recorded and sent in, family ones included: the record improves the plan and feeds the AI that supports the business.', 'Call, Jul 27.', 'Remi and Gabe'),
  (null, 'The standing rhythm: Mondays 2pm with Remi, Sunday week design, the monthly family business meeting with the books open, the monthly close.', 'Call, Jul 27 (Monday chosen so the plan is clear for the week); six-month build page 2.', 'Gabe'),
  (null, 'The finish line is written down now: 10 boys, 7+ committed clients, 2 groups, a $20k gross month, Gabe on his own rhythm, by January.', 'Call, Jul 27, the perfect-Tuesday interview; six-month build page 6.', 'Remi and Gabe'),
  (null, 'Two streams, one brand, family owned: the boys'' outdoor program on the Baylands and the premium fitness practice, both under Wild Wanderers.', 'Call, Jul 27; business plan.', 'Gabe'),
  (null, 'The role shifts from builder to coach: six months of accountability and co-built strategy, Remi-led scope and sequence, Gabe free to take the lead as things come up.', 'Call, Jul 27; the commitment section of the business plan.', 'Remi and Gabe'),
  (null, 'SOBO''s dual role is disclosed and on the record: SOBO builds and holds a stake in the Wild Wanderers platform and also coaches the business that runs on it.', 'Call, Jul 27. Disclosed to Gabe in session one. Platform recommendations carry SOBO''s own interest, so they get named as such and Gabe decides. No cash either way; the engagement is a trade of training for coaching.', 'Remi and Gabe')
) as v(ws, title, context, who)
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and not exists (
    select 1 from public.decisions d where d.engagement_id = e.id and d.title = v.title
  );

insert into public.action_items
  (engagement_id, practice_id, client_id, title, timing, due_on, status, audience, source)
select e.id, e.practice_id, e.client_id, v.title, v.timing, v.due_on, 'open', 'client', 'manual'
from public.engagements e, (values
  ('Five real asks a week, every week, from week one: a real person, a real offer, a real price, out loud', 'standing', null::date),
  ('Sunday, 30 minutes: design the week. Sessions, asks, admin, family, on the calendar before Monday', 'standing', null),
  ('Record business conversations, family ones included, and send them in', 'standing', null),
  ('The reading list in order: The E-Myth Revisited first, then start $100M Offers', 'standing', null),
  ('Confirm LLC, insurance, and CPR status; close or schedule every protection item', 'standing', null),
  ('Read the two founding documents with Sarah, together, not a summary: the business plan and the six-month build', 'before_session', date '2026-08-03'),
  ('Record the conversation with Sarah about the founding documents and send it to Remi', 'before_session', date '2026-08-03'),
  ('Review the two pricing fixes and the month-one targets; come Monday ready to say yes or push back', 'before_session', date '2026-08-03')
) as v(title, timing, due_on)
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and not exists (
    select 1 from public.action_items a where a.engagement_id = e.id and a.title = v.title
  );

-- Outcomes carry baseline, target, and current standing. Standing is
-- only ever a known-true value; where the number is not known, the
-- standing says so rather than guessing one.
insert into public.outcomes
  (engagement_id, practice_id, client_id, workstream_id, title, baseline_md, target_md, standing_md, standing_updated_at, sort)
select e.id, e.practice_id, e.client_id,
       (select w.id from public.workstreams w where w.engagement_id = e.id and w.title = v.ws),
       v.title, v.baseline, v.target, v.standing, now(), v.sort
from public.engagements e, (values
  (null, 'Fall cohort full: ten boys enrolled', 'No families enrolled; no five names on the list today', '10 boys, three mornings a week; 80 percent plus re-enrolled for spring', '0 of 10 enrolled. No families enrolled yet; the cohort launches mid-September.', 0),
  (null, 'Seven or more committed fitness clients', 'The practice grosses about $8k a month today; the next five clients cannot yet be named', '7+ committed clients at two to three sessions a week', 'Baseline count to confirm with Gabe. The session one number was the perfect-Tuesday target, not a count of committed clients today.', 1),
  (null, 'Two groups running', 'One group offer at the $250 flat launch rate', 'Two groups running; growth by groups, founding clients keep their price', '1 of 2 running. The standing group of three runs at the $250 flat rate.', 2),
  (null, 'A $20k gross month', 'About $8k gross a month; the bridge is $12k', '$20k hit, or within reach with a named path, at the January checkpoint', 'About $8k gross a month, unchanged from the baseline. The bridge to $20k is $12k.', 3),
  (null, 'The protection layer closed', 'LLC, insurance, and CPR to confirm; waivers not yet drafted', 'Every layer closed or standing rule: entity and books, insurance, waivers and consent, safety and readiness, scope of practice', 'Nothing closed yet. LLC, insurance, and CPR all still to confirm; waivers not drafted. Closes before the first family enrolls.', 4),
  (null, 'Gabe running his own rhythm, unprompted', 'The rhythm starts this week: the first Monday 2pm call held Jul 27', 'Sunday design, Monday scorecard, monthly close, without prompting; coaching steps down to advisor rhythm if the checkpoint passes', 'Started. The first Monday 2pm call was held Jul 27 and the second is booked for Aug 3. Sunday design, the monthly family meeting, and the monthly close have not run a full cycle yet.', 5),
  ('The pipeline', 'Five real asks a week', 'No ask rhythm today. No five families and no five clients can be named.', '5 real asks a week, every week, from week one: a real person, a real offer, a real price, said out loud.', '0 of 5. Tracking starts week one.', 6)
) as v(ws, title, baseline, target, standing, sort)
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and not exists (
    select 1 from public.outcomes o where o.engagement_id = e.id and o.title = v.title
  );

insert into public.readiness_markers (engagement_id, practice_id, client_id, pillar, note_md)
select e.id, e.practice_id, e.client_id, v.pillar, v.note
from public.engagements e, (values
  ('philosophy', 'Does Gabe think like the owner, not the technician? On Remi. The E-Myth shift; prices said without flinching; one client is worth $1,300 a month and gets treated like family; the boys'' program stays on mission while a paying baseline funds scholarship spots.'),
  ('system', 'Is there a system a professional operator would respect? On Remi. The scorecard with the two funnels and the bridge tracker; Profit First accounts opened as written; the protection layer closed; the enrollment flow live end to end.'),
  ('execution', 'Is he running it, week to week? On Gabe, and the one thing no one can do for him. Evidence is history: five asks a week logged, Sunday design done, Monday sessions held, the monthly close faced.')
) as v(pillar, note)
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and not exists (
    select 1 from public.readiness_markers r where r.engagement_id = e.id and r.pillar = v.pillar
  );

-- 7. Deliverables: the two shipped founding documents, then the ledger

insert into public.deliverables
  (engagement_id, practice_id, client_id, title, kind, storage_path, status, delivered_on, about_md, session_id)
select e.id, e.practice_id, e.client_id, v.title, 'file',
       e.practice_id || '/' || e.client_id || '/' || e.id || '/founding/' || v.file,
       'shipped', date '2026-07-27', v.about,
       (select s.id from public.sessions s where s.engagement_id = e.id order by s.starts_at limit 1)
from public.engagements e, (values
  ('The Business Plan: vision, numbers, next moves (founding document, V1)', 'WildWanderers_Business_Plan.pdf', 'The founding document for the whole family: the vision, the one-three-five, the real numbers, the protection plan, and what this takes from everybody. The one to read with Sarah.'),
  ('The Six-Month Build: August to January (founding document, V1)', 'WildWanderers_SixMonth_Build.pdf', 'August to January, month by month: targets, the skills Gabe builds, what SOBO builds, and how we know each month worked. Page 2 is the weekly operating system; page 6 is the definition of markedly different, so January has a scoreboard.')
) as v(title, file, about)
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and not exists (
    select 1 from public.deliverables d where d.engagement_id = e.id and d.title = v.title
  );

-- The planned ledger. V1 deliverables holds shipped artifacts (kind
-- file or link); these carry status planned with kind null until the
-- artifact exists, the seed-planned-deliverables.sql precedent.
insert into public.deliverables
  (engagement_id, practice_id, client_id, title, status)
select e.id, e.practice_id, e.client_id, v.title, 'planned'
from public.engagements e, (values
  ('Scorecard v1 in the Wild Wanderers app: the Families and Clients funnels and the bridge tracker'),
  ('Enrollment flow live end to end: inquiry, conversation, waiver, payment'),
  ('Waiver and enrollment packet, drafted for professional review'),
  ('Coach accountability card: clients see Gabe''s week'),
  ('Parent update rhythm in the app: the after-session note'),
  ('Client welcome package: the shirt, the letter, the standard'),
  ('Trailhead Library feeding the pipeline weekly'),
  ('Profit First views in the app, money side'),
  ('Assessment system live for client onboarding'),
  ('Spring enrollment flow, one click from the fall version'),
  ('Referral tracking in the funnels'),
  ('Holiday plan set before Thanksgiving: schedule, billing, communication'),
  ('Retention flags on the scorecard: at-risk clients surfaced weekly'),
  ('The six-month review document: every number, plan versus actual, honest'),
  ('Year-one tax package prep: clean books export for the accountant')
) as v(title)
where e.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and not exists (
    select 1 from public.deliverables d where d.engagement_id = e.id and d.title = v.title
  );

-- 8. The coaching contract, pinned -----------------------------------
-- Gabe's own answer to "how do you want me to interact with you",
-- stored word for word from the session one transcript. This is the
-- one piece of transcript text that belongs in the record: it is the
-- working agreement for the Monday call, not client finances or
-- personnel detail, and Gabe said it to be held to it.
-- audience 'practice' deliberately; see FLAGS.

insert into public.resources (practice_id, title, kind, audience, tags, body_md)
select p.id, 'The coaching contract: how Gabe wants to be coached', 'framework', 'practice',
       array['coaching','contract','wild-wanderers','session-one'],
$ww$# The coaching contract, in Gabe's words

Wild Wanderers, session one, July 27 2026. Remi asked how Gabe wants to be coached when he is off plan. What follows is his answer, word for word from the session one transcript, unedited. It sets how the Monday 2pm call is run.

## Verbatim, session one transcript

> **You**
> Okay, last thing for you as a, I mean, and and, and, you know, you were an athlete. So I imagine that you don't mind being coached. Right? But let's say, you're off. of your plan in week 9 or something like that, you know? What do you want from me? What do you want me? How do you want me to interact with you?
>
> **Gabe Brewer**
> Um, kind of the, you know, the same way. I would
>
> **You**
> Mhm.
>
> **Gabe Brewer**
> with you or with a, with um, a client, a fitness
>
> **You**
> Mm-hmm.
>
> **Gabe Brewer**
> client. Uh, Yeah. You know, whatever those, those check-ins would be and, um, Yeah, um... It wouldn't necessarily, it wouldn't be like a, A test or, you know, um, Maybe being there to let me know what the, those next moves when things do start to,
>
> **You**
> Mm-hmm.
>
> **Gabe Brewer**
> increase or, you know, improve. How do I? how do I increase my. My bandwidth at that point.
>
> **You**
> Okay.
>
> **Gabe Brewer**
> What, yeah, what, yeah, what would be my next move?

## The standard it sets

Three things, in his own phrases:

1. **Check-ins, the way he runs them with a fitness client.** Regular, familiar, part of the work.
2. **Not a test.** Being off plan is not a thing to be caught at.
3. **The next move.** When something starts to improve, the job is to name what comes next and how he increases his bandwidth to carry it.
$ww$
from public.practices p
where not exists (
  select 1 from public.resources r
  where r.practice_id = p.id and r.title = 'The coaching contract: how Gabe wants to be coached'
);

insert into public.session_prep_resources (session_id, resource_id, practice_id, client_id)
select s.id, r.id, s.practice_id, s.client_id
from public.sessions s, public.resources r
where s.client_id = (select id from public.clients where name = 'Wild Wanderers')
  and s.starts_at = timestamptz '2026-07-27 14:00:00 America/Los_Angeles'
  and r.title = 'The coaching contract: how Gabe wants to be coached'
  and not exists (
    select 1 from public.session_prep_resources spr
    where spr.session_id = s.id and spr.resource_id = r.id
  );
