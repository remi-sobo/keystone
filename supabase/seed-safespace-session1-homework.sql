-- Keystone Session 1 homework seed: the four assignments given out loud
-- at the close of Session 1 (Tue 2026-07-21), copy verbatim from Remi's
-- session prompt. Rides the existing homework model (V2 3C
-- action_items), NO new tables: audience groups route as per-person
-- assignment rows, the pre-work convention, so "all" lands on Susan,
-- Aris, and Jasmine, "founders" on Susan, and "coachees" on Aris and
-- Jasmine. Real members only: the invites are out and claimed, and the
-- remi+ test personas are due for deactivation (setup checklist), so
-- they carry no new rows.
--
-- Every item attaches to the booked Session 1 row, resolved through the
-- roadmap: engagement_sessions S1 points at its booked twin via
-- scheduled_at = sessions.starts_at (the 0038 contract). If either row
-- is absent this file inserts nothing.
--
-- Idempotent: each insert guards on (engagement, assignee, title), so a
-- re-run adds nothing and never touches a status someone has moved.
--
-- The learning conversation happens OUTSIDE Keystone by design: the
-- recording goes straight to Remi by email, and nothing in the copy
-- invites typing sensitive detail into the platform (the section 12
-- firewall posture).

-- ── Item 1: the learning conversation, all three ─────────────────────
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
), s1 as (
  select s.id from sessions s
  join engagement_sessions es
    on es.engagement_id = s.engagement_id
   and es.scheduled_at = s.starts_at
  where es.code = 'S1'
    and es.client_id = (select id from clients where name = 'SafeSpace')
    and s.status <> 'canceled'
  limit 1
)
insert into action_items
  (engagement_id, practice_id, client_id, session_id, title, body_md,
   assigned_client_member_id, timing, audience, source, status, due_on)
select e.id, e.practice_id, e.client_id, s1.id,
  'The learning conversation (due Wednesday night)',
  $s1_learn$This is the big one, and it's due Wednesday night so we can use it Thursday.

The three of you sit down together for 60 to 90 minutes and talk through the questions below, out loud, with a recorder running (Read AI, Otter, or any tool that gives you a transcript). Then email the transcript to Remi, the earlier the better. Your answers are what we use to customize your BloomOS instance, so the more real you are, the better your system fits.

How to run it:
- Aris leads and keeps it moving. Everyone answers; interrupt each other, disagree, add on.
- "I don't know" is a great answer. Say it and move on, it shows us where to dig.
- Rough and honest beats polished. Nobody is grading this.
- One privacy rule: talk about young people in the aggregate or first names only, and leave out anything clinical or sensitive about any individual young person. Donor names are fine here, this recording comes straight to Remi.

**Program**
1. Walk through what SafeSpace actually does, program by program. What are the pieces?
2. Who do you serve, and how many? How do you know that number, and where does it live?
3. For a young person who comes through SafeSpace, what's the journey, start to finish?
4. What do you track about the program today, attendance, outcomes, anything? Where does it live, a spreadsheet, a notebook, someone's memory?
5. What don't you track that you wish you could?

**Fundraising and donors**
6. How does money come in today? Break it down: individuals, events, grants, earned, roughly what share each?
7. Where do donor records live right now? A spreadsheet, a system, Susan's contacts, a mix?
8. For your most important donors, what do you know about them, and where is it written down, if it's written down at all?
9. What happens today when someone gives? Thanked, tracked, followed up? Walk through it.
10. Who touches fundraising today, and what does each person actually do?

**Grants**
11. Are you getting grant funding now? From whom, roughly how much?
12. How do you find and track grant opportunities and deadlines? Is there a list anywhere?
13. Who writes the grants, and what's that process like?
14. What do funders ask you to report back, and how do you produce that today?

**Finance**
15. Who does the books, and in what?
16. Is there a current annual budget? Where does it live, and who actually looks at it?
17. Do you know your runway, how many months of cash you have right now?
18. When you need a financial number, who do you go to and how long does it take?

**Impact**
19. If a funder asked "how do you know this works," what would you say today?
20. What outcomes do you believe you create, and what do you have to back it up?
21. What feedback do you collect from the kids or families, surveys, stories, data?

**Operations**
22. What are the recurring things that simply have to happen, filings, renewals, board meetings, and how do you keep track of them today?
23. What falls through the cracks most often?
24. What do you spend time on that feels like it should just be automatic?

**To close**
25. Of everything you just talked through, what keeps you up at night?
26. What's the one thing that, if it just worked, would change your week?$s1_learn$,
  cm.id, 'after_session', 'client', 'manual', 'open', date '2026-07-22'
from e, s1, client_members cm
where cm.client_id = e.client_id
  and cm.revoked_at is null
  and lower(cm.email) in
    ('susan@safespace.org', 'aris@safespace.org', 'jasmine@safespace.org')
  and not exists (
    select 1 from action_items ai
    where ai.engagement_id = e.id
      and ai.assigned_client_member_id = cm.id
      and ai.title = 'The learning conversation (due Wednesday night)'
  );

-- ── Item 2: the donor history document, Susan ────────────────────────
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
), s1 as (
  select s.id from sessions s
  join engagement_sessions es
    on es.engagement_id = s.engagement_id
   and es.scheduled_at = s.starts_at
  where es.code = 'S1'
    and es.client_id = (select id from clients where name = 'SafeSpace')
    and s.status <> 'canceled'
  limit 1
)
insert into action_items
  (engagement_id, practice_id, client_id, session_id, title, body_md,
   assigned_client_member_id, timing, audience, source, status)
select e.id, e.practice_id, e.client_id, s1.id,
  'The donor history document',
  $s1_donor$Pull together the full donor record however it exists today, the spreadsheet, the lists, the history of who has given and roughly what and when. Don't clean it up or reformat it, real and messy is exactly right. Remi will follow up with you directly on how to hand it over, and we'll import it in small batches, about ten donors at a time, so the history lives in your system and every conversation starts with the full picture.$s1_donor$,
  cm.id, 'after_session', 'client', 'manual', 'open'
from e, s1, client_members cm
where cm.client_id = e.client_id
  and cm.revoked_at is null
  and lower(cm.email) = 'susan@safespace.org'
  and not exists (
    select 1 from action_items ai
    where ai.engagement_id = e.id
      and ai.assigned_client_member_id = cm.id
      and ai.title = 'The donor history document'
  );

-- ── Item 3: two readings, Aris and Jasmine ───────────────────────────
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
), s1 as (
  select s.id from sessions s
  join engagement_sessions es
    on es.engagement_id = s.engagement_id
   and es.scheduled_at = s.starts_at
  where es.code = 'S1'
    and es.client_id = (select id from clients where name = 'SafeSpace')
    and s.status <> 'canceled'
  limit 1
)
insert into action_items
  (engagement_id, practice_id, client_id, session_id, title, body_md,
   assigned_client_member_id, timing, audience, source, status)
select e.id, e.practice_id, e.client_id, s1.id,
  'Two readings from your library',
  $s1_read$Both are in your Library here in Keystone, and both are short.
- The Second Bottom Line. Read it this week. It's the deep dive behind today's teaching on money and mission.
- Confidence Is a System. This one's not optional, it's your equipment. It's the research and the system behind everything we said today about confidence and reps.$s1_read$,
  cm.id, 'after_session', 'client', 'manual', 'open'
from e, s1, client_members cm
where cm.client_id = e.client_id
  and cm.revoked_at is null
  and lower(cm.email) in ('aris@safespace.org', 'jasmine@safespace.org')
  and not exists (
    select 1 from action_items ai
    where ai.engagement_id = e.id
      and ai.assigned_client_member_id = cm.id
      and ai.title = 'Two readings from your library'
  );

-- ── Item 4: Thursday's baseline, Aris and Jasmine ────────────────────
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
), s1 as (
  select s.id from sessions s
  join engagement_sessions es
    on es.engagement_id = s.engagement_id
   and es.scheduled_at = s.starts_at
  where es.code = 'S1'
    and es.client_id = (select id from clients where name = 'SafeSpace')
    and s.status <> 'canceled'
  limit 1
)
insert into action_items
  (engagement_id, practice_id, client_id, session_id, title, body_md,
   assigned_client_member_id, timing, audience, source, status, due_on)
select e.id, e.practice_id, e.client_id, s1.id,
  'Thursday: your baseline',
  $s1_base$Two quick things happen at the start of Thursday's session, and neither needs prep.
- You'll each rate your own confidence across the core fundraising skills, a two-minute self-rating. We do it at the start, monthly, and at the end, so you can watch it grow. It's a growth measure, never a grade.
- You'll each give a 60-second answer to "what does SafeSpace do, and why does it matter?" Rough is the point. This is your before picture, and in six months you'll hear it back and laugh.$s1_base$,
  cm.id, 'after_session', 'client', 'manual', 'open', date '2026-07-23'
from e, s1, client_members cm
where cm.client_id = e.client_id
  and cm.revoked_at is null
  and lower(cm.email) in ('aris@safespace.org', 'jasmine@safespace.org')
  and not exists (
    select 1 from action_items ai
    where ai.engagement_id = e.id
      and ai.assigned_client_member_id = cm.id
      and ai.title = 'Thursday: your baseline'
  );

-- ── The apply log says what landed ───────────────────────────────────
select ai.title, count(*) as assignees,
       count(ai.session_id) as attached_to_s1, min(ai.due_on) as due_on
from action_items ai
where ai.client_id = (select id from clients where name = 'SafeSpace')
  and ai.timing = 'after_session'
group by ai.title
order by ai.title;
