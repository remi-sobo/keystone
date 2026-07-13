-- The SafeSpace ledger graduates (2026-07-13). Run once after
-- migration 0035; idempotent. The pinned library resource 'Planned
-- deliverables: the SafeSpace ledger' was the explicit stand-in until
-- planned deliverables had a first-class home; 0035 built the home, so
-- each ledger item becomes a planned deliverable row on its workstream
-- and the placeholder leaves the library (the charter graduation
-- pattern, seed-charter-v1.sql). With it goes the last client-named
-- row on the practice-wide library shelf (the FLAG in CURRENT.md).
--
-- Items and workstreams are seed doc section 8 verbatim (updated
-- through the signed agreement). Hub milestones carry that word in the
-- expected note; the month-6 handoff keeps its timing. The website
-- stays off the list on purpose: it is the first pre-named change
-- order, not a promise.

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace') limit 1
),
ws as (
  select w.title, w.id from workstreams w, e where w.engagement_id = e.id
)
insert into deliverables
  (engagement_id, practice_id, client_id, workstream_id, title, status,
   kind, delivered_on, expected_note, note)
select e.id, e.practice_id, e.client_id,
       (select id from ws where title = v.ws),
       v.title, 'planned', null, null, v.expected, v.note
from e, (values
  ('Fundraising strategy and plan document, with a major donor component',
   'Build the system', null,
   'Prospect identification approach plus cultivation and solicitation plans; named prospects live in the hub CRM, entered by SafeSpace'),
  ('Annual fundraising calendar', 'Build the system', null, null),
  ('Case for support', 'Build the system', null, null),
  ('Donor templates: outreach, thank-you, and follow-up', 'Build the system', null, null),
  ('Donor pipeline and journeys live in the hub', 'Build the system', 'hub milestone', null),
  ('Gift table and segmentation strategy', 'Build the system', null, null),
  ('Finance dashboard and board login', 'Build the system', 'hub milestone', null),
  ('Pitch deck', 'Develop the leaders', null, null),
  ('Send deck', 'Develop the leaders', null, null),
  ('One-pager', 'Develop the leaders', null, null),
  ('Narrative frame: the next ten years', 'Develop the leaders', null, null),
  ('Board fundraising toolkit and introductions playbook', 'Develop the leaders', null, null),
  ('Impact and evaluation framework', 'Show the impact', null, null),
  ('Funder-ready impact artifacts', 'Show the impact', null, null),
  ('Compliance and HR foundations documented', 'Hold the back office', null, null),
  ('Operating rhythms documented for handoff', 'Hold the back office', 'month 6', null)
) as v(title, ws, expected, note)
where not exists (
  select 1 from deliverables d, e
  where d.engagement_id = e.id and d.title = v.title
);

-- The ledger placeholder leaves the library once the plan has rows.
delete from resources r
where r.title = 'Planned deliverables: the SafeSpace ledger'
  and exists (
    select 1 from deliverables d
    where d.client_id = (select id from clients where name = 'SafeSpace')
      and d.status = 'planned'
  );
