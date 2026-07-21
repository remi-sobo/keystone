-- Keystone pre-work seed: the two Session 1 pre-work assignments.
-- Source: Remi's pre-work prompt (2026-07-17), copy verbatim. Rides the
-- existing homework model (V2 3C action_items), NO new tables: audience
-- routing is per-person assignment, so the coachee item lands on Aris
-- and Jasmine and the founder item on Susan, with the remi+ test
-- personas carrying matching rows so the live confirm can run before
-- the real invites go out (they retire with the personas).
--
-- Idempotent: each insert guards on (engagement, assignee, title), so a
-- re-run adds nothing and never touches a status someone has moved.
-- The items are deliberately answerless: notes live with each person,
-- not in the platform (the section 12 firewall posture; donor names
-- and budget numbers stay out of the delivery platform).

-- ── Item A: the coachees ─────────────────────────────────────────────
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
)
insert into action_items
  (engagement_id, practice_id, client_id, title, body_md,
   assigned_client_member_id, timing, audience, source, status)
select e.id, e.practice_id, e.client_id,
  'Pre-work: Seeing it clearly',
  $prework_a$You're stepping into running this. Start by looking at it straight on. About thirty minutes, rough first-draft notes are exactly right, and it's worth comparing notes with each other before Tuesday. Bring your thinking to the session; nothing needs to be typed in here.

1. In your own words, what does SafeSpace actually do right now? If a stranger asked, what would you say?
2. What are the one or two things that are the real heart of it, the parts you'd protect no matter what?
3. What are we doing that's probably spreading us thin, or that you're not sure still earns its place?
4. How does money come in today, as best you understand it? Who are the people or funders you know give?
5. When you picture asking someone for money, what comes up for you? Be honest, there's no wrong answer here.
6. Why do you want to run this organization? What part of that excites you, and what part worries you?$prework_a$,
  cm.id, 'before_session', 'client', 'manual', 'open'
from e
join client_members cm
  on cm.client_id = e.client_id
 and lower(cm.email) in
   ('aris@safespace.org', 'jasmine@safespace.org',
    'remi+aris@ambitionangels.org', 'remi+jasmine@ambitionangels.org')
where not exists (
  select 1 from action_items ai
  where ai.engagement_id = e.id
    and ai.assigned_client_member_id = cm.id
    and ai.title = 'Pre-work: Seeing it clearly'
);

-- ── Item B: the founder ──────────────────────────────────────────────
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
)
insert into action_items
  (engagement_id, practice_id, client_id, title, body_md,
   assigned_client_member_id, timing, audience, source, status)
select e.id, e.practice_id, e.client_id,
  'Pre-work: What you see',
  $prework_b$You're handing something you built into new hands. Help us see what you see. About thirty minutes, rough is fine. Bring your notes to the session; nothing needs to be typed in here.

1. If SafeSpace is thriving three years from now, what's true that isn't true today?
2. What's the next-ten-years version of this organization? What does "here to stay" look like to you?
3. Where do you see Aris and Jasmine at their strongest? Where's each one's growth edge?
4. What would "ready to run it" actually look like to you, so we're aiming at the same thing?
5. Your handful of most important donor relationships: who are they, and what's the short story with each? (This is the start of the top-donor list. Names and a sentence each is plenty.)
6. The honest state of the budget and runway, and the number the org needs to be sustainable. (Rough is fine.)$prework_b$,
  cm.id, 'before_session', 'client', 'manual', 'open'
from e
join client_members cm
  on cm.client_id = e.client_id
 and lower(cm.email) in
   ('susan@safespace.org', 'remi+susan@ambitionangels.org')
where not exists (
  select 1 from action_items ai
  where ai.engagement_id = e.id
    and ai.assigned_client_member_id = cm.id
    and ai.title = 'Pre-work: What you see'
);

-- ── The apply log says what landed ───────────────────────────────────
select ai.title, count(*) as assignees
from action_items ai
where ai.client_id = (select id from clients where name = 'SafeSpace')
  and ai.timing = 'before_session'
  and ai.title like 'Pre-work:%'
group by ai.title
order by ai.title;
