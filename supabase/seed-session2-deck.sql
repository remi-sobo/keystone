-- Session 2's teaching deck graduated into session_slides rows: the
-- twenty-one slides of SafeSpace_Session02_Teaching.html (the v2
-- standalone deck, committed at docs/decks/), payloads verbatim from
-- the in-repo fixture src/lib/deck/session2.ts so the seeded deck and
-- the fixture can never disagree. Layered after seed.sql and
-- seed-safespace-roadmap.sql like the other SafeSpace seeds; if the S2
-- roadmap session is absent this file inserts nothing.
--
-- Idempotent: slides key on (engagement_session_id, sort_order), unique
-- since 0039, with on conflict do nothing, so a re-run never duplicates
-- a slide and never clobbers an edit made since.
--
-- One layout note, flagged on apply: the v2 deck's sort slide renders
-- big chips under an idea-style head; the 0039 tracks layout is the
-- structural home for a chip row, so the slide rides tracks with an
-- empty label and the sup line as the note. Content verbatim, layout
-- approximate; the standalone HTML stays the in-room safety net.

with s as (
  select es.id as session_id, es.engagement_id, es.practice_id, es.client_id
  from engagement_sessions es
  where es.code = 'S2'
    and es.client_id = (select id from clients where name = 'SafeSpace')
  limit 1
)
insert into session_slides
  (engagement_session_id, engagement_id, practice_id, client_id, sort_order, slide_type, payload)
select s.session_id, s.engagement_id, s.practice_id, s.client_id,
       v.sort_order, v.slide_type, v.payload::jsonb
from s, (values
  (1, 'cover', '{"eyebrow": "The Six-Month Build", "title": "Session Two", "subtitle": "The three-year program plan starts today.", "meta_left": "SafeSpace", "meta_right": "SOBO", "meta_when": "Thursday, 3:00 PM"}'),
  (2, 'idea', '{"eyebrow": "The Ritual", "head": "Start with a win.", "sup": "One each, from the last two days. Small counts. This is how every session opens from now on."}'),
  (3, 'agenda', '{"eyebrow": "Today", "title": "What we’ll do today", "items": ["Your baseline: the check-in and your first pitch", "Your organization, in your words", "The teaching: fewer things, done well", "The sort: everything you do, on the wall", "Five answers I can’t write the plan without", "Your Bloom"]}'),
  (4, 'idea', '{"eyebrow": "Baseline · Do", "head": "Your first pitch.", "sup": "Sixty seconds each: what does SafeSpace do, and why does it matter? No notes. Rough is the point, this is the before picture."}'),
  (5, 'section', '{"num": "01", "title": "What we heard", "sub": "Your organization, in your words."}'),
  (6, 'idea', '{"eyebrow": "The Mirror", "head": "Here’s what you told us.", "sup": "I’ll walk it back department by department. Stop me where I’m wrong, add what we missed. What you confirm today is what the plan gets built from."}'),
  (7, 'section', '{"num": "02", "title": "The teaching", "sub": "Fewer things, done well."}'),
  (8, 'idea', '{"eyebrow": "Program 01", "head": "The mission is the mission. How we get there is the question.", "sup": "Nobody here needs convincing that SafeSpace matters. The question is which few things you’ll do so well that funders keep paying for them."}'),
  (9, 'idea', '{"eyebrow": "Program 02", "head": "Do fewer things, done well.", "sup": "Sprawl burns out a small team and blurs the story. Nobody funds twelve things. A flagship focuses your money, your people, and your pitch."}'),
  (10, 'idea', '{"eyebrow": "Program 03", "head": "You can’t budget what you haven’t defined.", "sup": "Next week Shannon builds your three-year budget. She can’t price a program nobody has defined. That’s why today comes first."}'),
  (11, 'section', '{"num": "03", "title": "The sort", "sub": "Everything you do, on the wall."}'),
  (12, 'tracks', '{"eyebrow": "Build · Do", "title": "Everything on the wall.", "tracks": [{"label": "", "chips": ["Flagship", "Core", "Supporting", "Release", "Not sure"]}], "note": "Your full list, all of it. We sort it together, and nothing gets released today without the reason said out loud."}'),
  (13, 'section', '{"num": "04", "title": "Five answers", "sub": "What I can’t write the plan without."}'),
  (14, 'idea', '{"eyebrow": "Answer 01 · The floor", "head": "What does every SYAB member get, guaranteed?", "sup": "Not what varies. What’s promised. Hours, weeks, and what they walk out with."}'),
  (15, 'idea', '{"eyebrow": "Answer 02 · The shape", "head": "Deeper, or wider?", "sup": "Same schools, done deeper. Or more schools. Pick one."}'),
  (16, 'idea', '{"eyebrow": "Answer 03 · Who delivers", "head": "How much of this should the kids run?", "sup": "Susan said eighty percent, once. Is seventy-five the three-year target, or was that thinking out loud?"}'),
  (17, 'idea', '{"eyebrow": "Answer 04 · The ceiling", "head": "At what number does each program break?", "sup": "Kids, schools, events in a month. The number where it stops working."}'),
  (18, 'idea', '{"eyebrow": "Answer 05 · The leak", "head": "A student does one workshop. Then what?", "sup": "Right now it ends there. On purpose, or a gap you’d close if you could?"}'),
  (19, 'idea', '{"eyebrow": "Your System", "head": "Your Bloom.", "sup": "A first look at yours, built from your own words this week. We’ll live in it together from here."}'),
  (20, 'homework', '{"eyebrow": "This Week", "title": "Before Tuesday", "rows": [{"who": "Everyone", "task": "The draft program plan lands tomorrow. Read it Monday. Mark what’s wrong, what’s missing, and what you won’t commit to for three years."}, {"who": "Susan", "task": "The financials package for Shannon: last two years of actuals and the current budget. The three-year budget starts next week."}, {"who": "Aris & Jasmine", "task": "Pitch practice, five minutes together. Rep three."}]}'),
  (21, 'close', '{"line1": "Fewer things.", "line2": "Done well. Funded fully.", "attr": "See you Tuesday."}')
) as v(sort_order, slide_type, payload)
on conflict (engagement_session_id, sort_order) do nothing;
