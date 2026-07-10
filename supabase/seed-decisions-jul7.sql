-- The July 7 decision graduation (V2 2B). Run once after migration
-- 0013; idempotent (guarded on the engagement having no decisions
-- yet). The thirteen decisions from the July 7 working call graduate
-- from session_notes.decisions_md prose to first-class rows: dated,
-- attributed, tied to the call's session, and workstream-tagged where
-- one clearly owns the decision. The session note keeps its prose
-- untouched; it is the record of the call, the log is the index born
-- from it. Decision 11 carries the fee by reference, per gate 9.

with e as (
  select e.id, e.practice_id, e.client_id from engagements e
  join clients c on c.id = e.client_id and c.name = 'SafeSpace'
  limit 1
),
s as (
  select s.id from sessions s, e
  where s.engagement_id = e.id and s.starts_at::date = date '2026-07-07'
  limit 1
),
ws as (
  select w.title, w.id from workstreams w, e where w.engagement_id = e.id
),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null
  limit 1
)
insert into decisions (engagement_id, practice_id, client_id, session_id, workstream_id,
  decided_on, title, context_md, decided_by_label, created_by)
select e.id, e.practice_id, e.client_id, (select id from s),
  (select id from ws where title = v.ws),
  date '2026-07-07', v.title, v.context, v.who, (select user_id from remi)
from e, (values
  ('Fundraising first. The build and coaching order.',
   'Proposal; confirmed on call, Jul 7.', 'Susan and Remi', 'Build the system'),
  ('Start now, front-load month one at twice weekly while program is slow, ahead of the season.',
   'Call, Jul 7; recap email.', 'Susan and Remi', null),
  ('SafeSpace owns everything in perpetuity. Custom build; databases and AI programs included.',
   'Call, Jul 7, direct answer to Susan.', 'Remi', 'Build the system'),
  ('SafeSpace pauses its other software purchase contingent on this engagement going ahead.',
   'Call, Jul 7.', 'Susan', null),
  ('Liesl moves to advisory and is used deliberately: assigned relationships, drafted letters, made easy.',
   'Call, Jul 7; recap email.', 'Susan and Remi', null),
  ('Susan stays in: strategizes existing donors, sits in selected meetings, brings the coachees on real calls. Not exiting.',
   'Call, Jul 7.', 'Susan', null),
  ('Reps model: Aris and Jasmine go on calls with Susan or Liesl first; Remi joins selected calls at SafeSpace''s request.',
   'Call, Jul 7; Susan''s follow-up note.', 'Susan and Remi', 'Develop the leaders'),
  ('Cadence set month by month, not fixed for six months upfront.',
   'Call, Jul 7.', 'Susan and Remi', null),
  ('Collateral set: pitch deck, send deck, one-pager; website named the fourth artifact and held as a separate engagement.',
   'Call, Jul 7.', 'Susan and Remi', 'Develop the leaders'),
  ('Segmentation approach: custom strategies for the top tier, simple letter and giving-tree campaigns below.',
   'Call, Jul 7.', 'Susan and Remi together', 'Build the system'),
  ('Fee accepted as proposed, one fee for all four workstreams, without negotiation, pending Aris and Jasmine''s full buy-in.',
   'Call, Jul 7. Answer promised by Wednesday night or Thursday morning; the number lives in the charter, per the fee gate.',
   'Susan', null),
  ('Weekly pitch practice as a standing rhythm from the start.',
   'Call, Jul 7.', 'Susan and Remi', 'Develop the leaders'),
  ('Go/no-go rests on the coachees: Susan wanted them 150 percent behind it before saying yes.',
   'Call, Jul 7.', 'Susan', null)
) as v(title, context, who, ws)
where not exists (
  select 1 from decisions d, e where d.engagement_id = e.id
);
