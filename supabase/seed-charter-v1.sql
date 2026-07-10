-- The SafeSpace charter graduation (V2 2A). Run once after migration
-- 0012; idempotent. The pinned library resource seeded in Phase 0 was
-- the explicit stand-in "until 2A ships"; 2A shipped, so the charter
-- becomes version 1 (published, by Remi), the sign-off request goes to
-- the client through 5D, and the placeholder leaves the library. The
-- graduation intro line is dropped from the body; the fee line stays,
-- per gate 9 (in the charter, nowhere else).

insert into engagement_charters
  (engagement_id, practice_id, client_id, version, body_md, status, published_at, published_by, created_by)
select e.id, e.practice_id, e.client_id, 1,
  replace(r.body_md,
    'This is the shared agreement for the SafeSpace engagement, drafted from the proposal, the recap email, and the July 7 call. It graduates to a first-class charter when that surface ships.

', ''),
  'published', now(),
  (select user_id from practice_members
   where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1),
  (select user_id from practice_members
   where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
from engagements e
join clients cl on cl.id = e.client_id and cl.name = 'SafeSpace'
join resources r on r.title like 'Engagement charter, draft%'
where not exists (
  select 1 from engagement_charters c where c.engagement_id = e.id
);

insert into approvals
  (practice_id, client_id, engagement_id, subject_type, subject_id, subject_label, requested_by)
select c.practice_id, c.client_id, c.engagement_id, 'charter', c.id,
  'the engagement charter, version 1',
  (select user_id from practice_members
   where lower(email) = 'remi@ambitionangels.org' and user_id is not null limit 1)
from engagement_charters c
where c.version = 1 and c.status = 'published'
  and c.client_id = (select id from clients where name = 'SafeSpace')
  and not exists (
    select 1 from approvals a
    where a.subject_type = 'charter' and a.subject_id = c.id
  );

-- The placeholder leaves the library once the charter row exists.
delete from resources r
where r.title like 'Engagement charter, draft%'
  and exists (
    select 1 from engagement_charters c
    where c.client_id = (select id from clients where name = 'SafeSpace')
      and c.version = 1
  );
