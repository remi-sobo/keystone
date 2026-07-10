-- The SafeSpace outcomes graduation (V2 2C). Run once after migration
-- 0015; idempotent (guarded on the engagement having no outcomes yet).
-- The seed doc section 4 table, in its own words: eight outcomes with
-- baselines and evidence-when-done, workstream-tagged where one owns
-- it, sorted in the table's order. Standing notes start empty; they
-- are the pilot's to write.

with e as (
  select e.id, e.practice_id, e.client_id from engagements e
  join clients c on c.id = e.client_id and c.name = 'SafeSpace'
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
insert into outcomes (engagement_id, practice_id, client_id, workstream_id,
  title, baseline_md, target_md, sort, created_by)
select e.id, e.practice_id, e.client_id,
  (select id from ws where title = v.ws),
  v.title, v.baseline, v.target, v.sort, (select user_id from remi)
from e, (values
  ('Documented fundraising strategy and plan',
   'No documented plan',
   'Plan a professional fundraiser would respect, in the hub',
   0, 'Build the system'),
  ('Donor pipeline running in a CRM',
   'No CRM; Excel and Google Docs',
   'Pipeline live with stages, journeys mapped for top donors',
   1, 'Build the system'),
  ('Weekly fundraising rhythm held',
   'No weekly fundraising rhythm exists in their roles',
   'Rhythm sessions happening consistently, visible in the record',
   2, 'Build the system'),
  ('Donor base segmented and worked',
   'About 1,200 contacts, most giving little or nothing',
   'Top tier on custom strategies; simple letter and giving-tree campaigns for the rest',
   3, 'Build the system'),
  ('Collateral ready',
   'None of the three artifacts exist',
   'Pitch deck, send deck, one-pager shipped; weekly pitch practice happening',
   4, 'Develop the leaders'),
  ('Aris and Jasmine leading calls',
   'Have shadowed Susan on a few calls',
   'Leading conversations, with reps logged, Susan or Remi joining selectively',
   5, 'Develop the leaders'),
  ('Board sees the financial picture live',
   'Board gets prepared updates',
   'Board login live with views SafeSpace controls (hub deliverable)',
   6, 'Build the system'),
  ('Impact evidence funder-ready',
   'Story told well in person and video, evidence scattered',
   'Framework live, funder-ready artifacts produced',
   7, 'Show the impact')
) as v(title, baseline, target, sort, ws)
where not exists (
  select 1 from outcomes o, e where o.engagement_id = e.id
);
