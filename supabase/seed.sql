-- Keystone production seed (Ring 1): tenant one and client one.
-- Run ONCE against the real project (psql or the Supabase SQL editor)
-- after 0001_keystone_spine.sql. Idempotent on the slug and emails.
--
-- CONFIRM gates pending (specs/keystone.md section 10):
--   CONFIRM 2: the four SafeSpace emails below are the spec's proposal;
--              confirm before sending invites.
--   CONFIRM 4: Shannon's practice login is seeded; remove if gate 4
--              lands "not in v1".
--   CONFIRM 5: the five workstream names are the spec's seeds; rename
--              with the client's own language once confirmed.
--   CONFIRM 9: fee_display is left null until gate 9 decides.

insert into practices (name, slug) values ('Sobo Consulting', 'sobo')
on conflict (slug) do nothing;

with p as (select id from practices where slug = 'sobo')
insert into practice_members (practice_id, email, role)
select p.id, v.email, v.role
from p, (values
  ('remi@soboconsulting.com', 'owner'),
  ('kendra@soboconsulting.com', 'consultant'),
  ('shannon@soboconsulting.com', 'consultant')
) as v(email, role)
on conflict do nothing;

with p as (select id from practices where slug = 'sobo')
insert into clients (practice_id, name)
select p.id, 'SafeSpace' from p
where not exists (
  select 1 from clients c, p where c.practice_id = p.id and c.name = 'SafeSpace'
);

with p as (select id from practices where slug = 'sobo'),
     c as (select id, practice_id from clients where name = 'SafeSpace')
insert into client_members (client_id, practice_id, email)
select c.id, c.practice_id, v.email
from c, (values
  ('susan@safespace.org'),
  ('liesl@safespace.org'),
  ('aris@safespace.org'),
  ('jasmine@safespace.org')
) as v(email)
on conflict do nothing;

with c as (select id, practice_id from clients where name = 'SafeSpace')
insert into engagements (practice_id, client_id, title, starts_on)
select c.practice_id, c.id, 'SafeSpace and Sobo Consulting', current_date
from c
where not exists (
  select 1 from engagements e, c where e.client_id = c.id
);

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'SafeSpace')
  limit 1
)
insert into workstreams (engagement_id, practice_id, client_id, title, sort)
select e.id, e.practice_id, e.client_id, v.title, v.sort
from e, (values
  ('Fundraising system and rhythms', 0),
  ('Leadership development, Aris and Jasmine', 1),
  ('The operating hub', 2),
  ('Impact and evaluation', 3),
  ('Back office', 4)
) as v(title, sort)
where not exists (
  select 1 from workstreams w, e where w.engagement_id = e.id
);
