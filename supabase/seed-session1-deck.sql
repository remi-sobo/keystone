-- Session 1's teaching deck graduated into session_slides rows: the
-- fourteen slides of SafeSpace_Session01_Teaching.html (the standalone
-- deck, committed at docs/decks/), payloads generated verbatim from the
-- in-repo fixture src/lib/deck/session1.ts so the seeded deck and the
-- static fixture can never disagree. Layered after seed.sql and
-- seed-safespace-roadmap.sql like the other SafeSpace seeds; if the S1
-- roadmap session is absent this file inserts nothing.
--
-- Idempotent: slides key on (engagement_session_id, sort_order), unique
-- since 0039, with on conflict do nothing, so a re-run never duplicates
-- a slide and never clobbers an edit made since.
--
-- Slide 13 (homework) was rewritten 2026-07-17 on Remi's call: the
-- brain dump graduated to pre-work (seed-safespace-prework.sql) and the
-- top-donor pull already rides Susan's pre-work, so the close-of-session
-- homework now points at the first pitch rep, the flagship question for
-- S2, and bringing the donor list Thursday. The original wording lives
-- in git history.

with s as (
  select es.id as session_id, es.engagement_id, es.practice_id, es.client_id
  from engagement_sessions es
  where es.code = 'S1'
    and es.client_id = (select id from clients where name = 'SafeSpace')
  limit 1
)
insert into session_slides
  (engagement_session_id, engagement_id, practice_id, client_id, sort_order, slide_type, payload)
select s.session_id, s.engagement_id, s.practice_id, s.client_id,
       v.sort_order, v.slide_type, v.payload::jsonb
from s, (values
  (1, 'cover', '{"eyebrow":"The Six-Month Build","title":"Session One","subtitle":"Getting set up, and the executive mindset.","meta_left":"SafeSpace","meta_right":"SOBO","meta_when":"Tuesday, 1:00 PM"}'),
  (2, 'agenda', '{"eyebrow":"Today","title":"What we’ll do today","items":["Get set up in Keystone, where we track the work together","Walk the map: the six-month scope and sequence","The executive mindset, our teaching for today","Begin the learning phase, department by department"],"footnote":"Your pre-work went out in the welcome email."}'),
  (3, 'section', '{"num":"01","title":"Where we’re headed"}'),
  (4, 'tracks', '{"eyebrow":"The Shape of It","title":"Two tracks, braided together","tracks":[{"label":"Build","chips":["Program plan","Budget","Fundraising plan","Operations"]},{"label":"Reps","alt":true,"chips":["Donor journeys","Live asks","Weekly pitch","Working the season"]}],"note":"We build the system in order. We practice from week two. You need both."}'),
  (5, 'loop', '{"eyebrow":"Every Week","title":"The same loop, every session","steps":["Philosophy","Build","Rhythm","Homework","Review"],"note":"Six months of this, and the pieces add up to the whole system."}'),
  (6, 'section', '{"num":"02","title":"The executive mindset"}'),
  (7, 'idea', '{"eyebrow":"Mindset 01","head":"A nonprofit is still a business.","sup":"The only difference: you don’t own it, and you can’t profit from it personally. You still have to bring money in."}'),
  (8, 'idea', '{"eyebrow":"Mindset 02","head":"You carry a double bottom line.","sup":"Impact and dollars. Almost everything you do has to serve both. That’s the job, and it’s harder than either one alone."}'),
  (9, 'idea', '{"eyebrow":"Mindset 03","head":"From program leader to executive.","sup":"A different role, not just a higher one. It’s the step the two of you said you want to make."}'),
  (10, 'idea', '{"eyebrow":"Mindset 04","head":"The donor is a partner.","sup":"You bring the work, they bring the funding, and you both want the same outcome. There’s no power dynamic. You’re in the same boat."}'),
  (11, 'section', '{"num":"03","title":"The learning phase","sub":"We’ll walk every department, program, fundraising, finance, impact, through one lens: what does a fundraiser need to understand here?"}'),
  (12, 'idea', '{"eyebrow":"Our Workspace","head":"Keystone is where we work together.","sup":"You’ll see the workstreams, the notes, and every artifact we build, in one place. We set it up today."}'),
  (13, 'homework', '{"eyebrow":"Before Thursday","title":"Before we meet again","rows":[{"who":"Aris + Jasmine","task":"Your first pitch rep: five minutes, pitch each other once before Thursday. Rough is the point."},{"who":"Everyone","task":"Come with an answer: if SafeSpace ran one flagship program, what would it be, and what would you stop doing to protect it?"},{"who":"Susan","task":"Bring the top-donor list from your pre-work. Thursday we start mapping it."},{"who":"Thursday","task":"Come ready to build."}]}'),
  (14, 'close', '{"line1":"It’s usually not the heart.","line2":"It’s the system.","attr":"See you Thursday."}')
) as v(sort_order, slide_type, payload)
on conflict (engagement_session_id, sort_order) do nothing;
