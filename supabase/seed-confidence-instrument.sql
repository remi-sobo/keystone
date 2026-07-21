-- The SafeSpace confidence instrument and schedule (agreement section
-- 3(e); the recurring self-rating Dr. Kendra's impact framework reads).
-- Idempotent: items key on (engagement_id, sort_order), check-ins on
-- (engagement_id, label), participants on (engagement_id,
-- client_member_id); re-running duplicates nothing.
--
-- Run against the LIVE project (or any database carrying the SafeSpace
-- pilot seed) after migration 0041. Targets the engagement by its
-- proposal title, the same key seed-safespace-pilot.sql uses.
--
-- CONFIRM-2 note: the prompt says the engagement starts Jul 15, 2026;
-- the live row's starts_on is 2026-07-08 (seeded as current_date the
-- day the project was provisioned). The schedule below uses the
-- prompt's literal dates, keyed to the agreement's Jul 15 start, so
-- the discrepancy changes nothing here. Flagged in CURRENT.md.
--
-- Participants: Aris and Jasmine, the two coachees, by their real
-- safespace.org memberships (never a test persona). Susan and Liesl
-- are deliberately NOT participants: no card, no instrument, no
-- responses, per the section 3(e) wall.

with e as (
  select id, practice_id, client_id from engagements
  where title = 'Systems and leaders: fundraising first'
  limit 1
)

insert into confidence_items (engagement_id, practice_id, client_id, domain, prompt, kind, sort_order)
select e.id, e.practice_id, e.client_id, v.domain, v.prompt, v.kind, v.sort_order
from e, (values
  -- Fundraising
  ('fundraising', 'Explain what SafeSpace does and why it matters, in 60 seconds, to someone who''s never heard of it.', 'scale', 1),
  ('fundraising', 'Prepare for, lead, and follow up on a donor meeting.', 'scale', 2),
  ('fundraising', 'Make a direct ask for a specific dollar amount.', 'scale', 3),
  ('fundraising', 'Ask a donor for a multi-year commitment.', 'scale', 4),
  ('fundraising', 'Steward a donor after a gift so the relationship grows: thank, update, involve.', 'scale', 5),
  ('fundraising', 'Identify and research new prospective donors and decide who''s worth pursuing.', 'scale', 6),
  -- Across the organization
  ('departments', 'Read the budget and explain where the money comes from and where it goes.', 'scale', 7),
  ('departments', 'Speak to the organization''s financial position and runway with a funder or a board member.', 'scale', 8),
  ('departments', 'Run the grants pipeline: find opportunities, track deadlines, and deliver what funders ask for.', 'scale', 9),
  ('departments', 'Tell the impact story with evidence a funder would trust.', 'scale', 10),
  ('departments', 'Run your weekly and monthly operating rhythms without anyone driving you.', 'scale', 11),
  ('departments', 'Use your systems to know what''s happening in the organization and what needs you next.', 'scale', 12),
  -- The executive seat
  ('mindset', 'Make a decision that weighs both impact and money, and explain the tradeoff out loud.', 'scale', 13),
  ('mindset', 'Say no to a good idea the organization can''t afford right now.', 'scale', 14),
  ('mindset', 'Walk into a room of funders feeling like a partner, not someone asking for a favor.', 'scale', 15),
  -- Open
  ('open', 'What feels most solid for you right now?', 'text', 16),
  ('open', 'What feels shakiest?', 'text', 17)
) as v(domain, prompt, kind, sort_order)
on conflict (engagement_id, sort_order) do nothing;

-- The schedule: baseline now, then monthly per the agreement, seven in
-- all, keyed to the agreement's Jul 15 start.
with e as (
  select id, practice_id, client_id from engagements
  where title = 'Systems and leaders: fundraising first'
  limit 1
)
insert into confidence_checkins (engagement_id, practice_id, client_id, label, opens_at, due_at, sort_order)
select e.id, e.practice_id, e.client_id, v.label, v.opens_at::date, v.due_at::date, v.sort_order
from e, (values
  ('Baseline', '2026-07-21', '2026-07-23', 0),
  ('Month 1',  '2026-08-15', '2026-08-22', 1),
  ('Month 2',  '2026-09-15', '2026-09-22', 2),
  ('Month 3',  '2026-10-15', '2026-10-22', 3),
  ('Month 4',  '2026-11-15', '2026-11-22', 4),
  ('Month 5',  '2026-12-15', '2026-12-22', 5),
  ('Final',    '2027-01-08', '2027-01-15', 6)
) as v(label, opens_at, due_at, sort_order)
on conflict (engagement_id, label) do nothing;

-- The two coachees, by their real emails.
with e as (
  select id, practice_id, client_id from engagements
  where title = 'Systems and leaders: fundraising first'
  limit 1
)
insert into confidence_participants (engagement_id, practice_id, client_id, client_member_id)
select e.id, e.practice_id, e.client_id, cm.id
from e
join client_members cm on cm.client_id = e.client_id
where lower(cm.email) in ('aris@safespace.org', 'jasmine@safespace.org')
on conflict (engagement_id, client_member_id) do nothing;
