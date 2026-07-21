-- Keystone roadmap seed: the SafeSpace six-month scope and sequence.
-- Source of truth: the client-approved SafeSpace Scope and Sequence doc
-- (SOBO Consulting, "The Six-Month Build"); titles are verbatim from
-- it. Layered after seed.sql (which creates the practice, the client,
-- and the engagement) like seed-safespace-pilot.sql; if the SafeSpace
-- engagement is absent this file inserts nothing.
--
-- Idempotent: phases key on (engagement_id, sort_order) and sessions on
-- (engagement_id, code), both unique since 0038, with on conflict do
-- nothing, so a re-run never duplicates a row and never clobbers a
-- status the practice has since moved (an S already marked done stays
-- done).
--
-- Mechanical substitutions from the doc, logged per the standing rule:
-- the two arrows in prose became words ("Program leader to nonprofit
-- executive", "$20k to $60k"), and the Oct-Dec range is spelled out.
-- No other content touched.

-- ── The six phases ───────────────────────────────────────────────────
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
)
insert into engagement_phases
  (engagement_id, practice_id, client_id, sort_order, month_label, title, subtitle)
select e.id, e.practice_id, e.client_id, v.sort_order, v.month_label, v.title, v.subtitle
from e, (values
  (1, 'Month 1', 'Foundation & the Program',
   'Twice weekly. Lay the philosophy, draft the three-year program plan, and start real donor reps.'),
  (2, 'Month 2', 'The Budget & the Math of the Ask',
   'The three-year and annual budget, then the gift table that falls out of it. Shannon leads the finance build.'),
  (3, 'Month 3', 'The Fundraising Plan',
   'Strategy, calendar, foundations, and the language, landing just as the season opens.'),
  (4, 'Month 4', 'The Season: Execution',
   'Real asks, real meetings, Remi on the calls. Less building, more doing.'),
  (5, 'Month 5', 'Peak & Operations',
   'Close the year while naming every operating rhythm and its owner.'),
  (6, 'Month 6', 'Stabilize & Handoff',
   'They run it, you observe. Teach-back to the board, final ratings, and the shift to a resource relationship.')
) as v(sort_order, month_label, title, subtitle)
on conflict (engagement_id, sort_order) do nothing;

-- ── The twenty-eight sessions ────────────────────────────────────────
with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
)
insert into engagement_sessions
  (engagement_id, phase_id, practice_id, client_id, sort_order, code, title, focus, cadence, attendees, status)
select e.id, ph.id, e.practice_id, e.client_id,
       v.sort_order, v.code, v.title, v.focus, v.cadence, v.attendees, v.status
from e
join (values
  -- Month 1 · Foundation & the Program (twice weekly)
  (1, 1,  'S1',  'Kickoff & the executive mindset',
   'A nonprofit is still a business. The double bottom line: impact and dollars. Program leader to nonprofit executive.',
   'Twice weekly', 'Aris, Jasmine, Susan', 'active'),
  (1, 2,  'S2',  'The 3-year program plan I',
   'The mission is the mission; how we get there is the question. Do fewer things well. Flagship over sprawl.',
   'Twice weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (1, 3,  'S3',  'Donor foundations & the pipeline',
   'The donor as partner, no power dynamic. The warm ask. Activate the community. The 90/10.',
   'Twice weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (1, 4,  'S4',  'Program plan II & impact',
   'Impact is the evidence funders trust. Decide exactly what we track.',
   'Twice weekly', 'Aris, Jasmine, Susan + Kendra', 'upcoming'),
  (1, 5,  'S5',  'Donor journeys & cultivation',
   'The ask is never a surprise. Cultivate before, steward after.',
   'Twice weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (1, 6,  'S6',  'Program lock, why budget follows',
   'You can''t ask for what you can''t cost. Raise for program, not salary. A 3-year ask needs a 3-year budget.',
   'Twice weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (1, 7,  'S7',  'First reps & the language',
   'Confidence comes from competence, competence from reps. It''s an art and a science. Tell the story that moves someone.',
   'Twice weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (1, 8,  'S8',  'Month-1 review & rhythm set',
   'A learning org: no losses, only lessons. What a healthy week looks like.',
   'Twice weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  -- Month 2 · The Budget & the Math of the Ask
  (2, 9,  'S9',  'Three-year budget I',
   'Program drives cost. The double bottom line, in numbers. Sustainable, not scaling for its own sake.',
   'Weekly', 'Aris, Jasmine, Susan + Shannon', 'upcoming'),
  (2, 10, 'S10', 'Annual budget & the finance view',
   'Runway and reserves. What a funder reads on the 990.',
   'Weekly', 'Aris, Jasmine, Susan + Shannon', 'upcoming'),
  (2, 11, 'S11', 'The gift table',
   'The budget defines the ask. The math of a campaign. 80/20 and the segments.',
   'Weekly', 'Aris, Jasmine, Susan + Shannon', 'upcoming'),
  (2, 12, 'S12', 'Language I: moving major donors',
   'The angles: mental health, youth leadership, community. Accurate, never spin. Listen, don''t fire-hose.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  -- Month 3 · The Fundraising Plan
  (3, 13, 'S13', 'Fundraising strategy & the mix',
   'Individual major gifts are the bread and butter, about 20% foundations. A strategy per segment.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (3, 14, 'S14', 'The calendar & the Q4 push',
   'The season is October to December. Backwards-plan from year-end. Newsletters are touches, not asks.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (3, 15, 'S15', 'Foundations & grants',
   'How foundations differ: needs, framing, timelines. A different angle per funder.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (3, 16, 'S16', 'Language II & collateral',
   'Foundation framing. The send deck vs the pitch deck. One clear one-pager.',
   'Weekly', 'Aris, Jasmine, Susan + Kendra', 'upcoming'),
  -- Month 4 · The Season: Execution
  (4, 17, 'S17', 'Preparing for the ask',
   'The full cycle: prep, lead, follow up, debrief. Read the donor and mirror. Giving potential and likelihood.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (4, 18, 'S18', 'Live asks & debrief I',
   'The room. You win some, you lose some. Rate likelihood afterward.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (4, 19, 'S19', 'Live asks II: the 3-year ask',
   '$20k to $60k over three years. Commit multi-year so you''re not re-asking. Steward as you go.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (4, 20, 'S20', 'Year-end campaign & event scoping',
   'The long tail: a low-lift giving-tree letter. The event as a spoke, pre-raise the room, the function does the last 10%.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  -- Month 5 · Peak & Operations
  (5, 21, 'S21', 'Year-end execution',
   'Hold the coalition. Steward in real time. Positive framing, always.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (5, 22, 'S22', 'Operations plan I',
   'Systems prevent drowning. Every rhythm needs an owner. Weekly, monthly, quarterly, annual.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (5, 23, 'S23', 'Operations II & the annual calendar',
   'The org runs on rhythms, not heroics. Compliance is a calendar, not a scramble.',
   'Weekly', 'Aris, Jasmine, Susan + Shannon', 'upcoming'),
  (5, 24, 'S24', 'Governance, policies & review',
   'Gift acceptance, expense, retention. Board access and the exclusion wall.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  -- Month 6 · Stabilize & Handoff
  (6, 25, 'S25', 'Year-end wrap & stewardship',
   'Post-gift stewardship. Turning a donor into "we." Celebrate and learn.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (6, 26, 'S26', 'They run it, you observe',
   'The handoff test: a new person could pick this up and run it. Remi steps back.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming'),
  (6, 27, 'S27', 'The teach-back',
   'They present the whole system and strategy to Susan and the board, and can say why each part exists.',
   'Weekly', 'Aris, Jasmine, Susan + Kendra', 'upcoming'),
  (6, 28, 'S28', 'Close & the resource relationship',
   'What ongoing support looks like. Care going forward. We''re here to stay.',
   'Weekly', 'Aris, Jasmine, Susan', 'upcoming')
) as v(phase_sort, sort_order, code, title, focus, cadence, attendees, status) on true
join engagement_phases ph
  on ph.engagement_id = e.id and ph.sort_order = v.phase_sort
on conflict (engagement_id, code) do nothing;

-- ── The apply log says what landed ───────────────────────────────────
select
  (select count(*) from engagement_phases p
    where p.client_id = (select id from clients where name = 'SafeSpace')) as phases,
  (select count(*) from engagement_sessions s
    where s.client_id = (select id from clients where name = 'SafeSpace')) as sessions,
  (select count(*) from engagement_sessions s
    where s.client_id = (select id from clients where name = 'SafeSpace')
      and s.status = 'active') as active_sessions;
