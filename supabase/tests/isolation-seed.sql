-- The Keystone seeded isolation matrix (Ring 1). Pattern from BloomOS
-- supabase/tests/rls-leak-test.sql, extended to the two-level scope.
--
-- Run by scripts/test-rls.sh after all migrations apply to a stubbed
-- Postgres. Any leak raises an exception, which fails CI via
-- ON_ERROR_STOP. Asserts BOTH dimensions:
--   cross-practice: a member of practice_b reads zero practice_a rows.
--   cross-client:   a member of client_a2 reads zero client_a1 rows
--                   INSIDE the same practice (the catastrophic leak in
--                   specs/keystone.md section 9), and vice versa.
--
-- The Ring 0 gate contract asked for two practices, each with one
-- client; this seed is a superset: practice_a carries TWO clients so the
-- same-practice cross-client wall is actually exercised.
--
-- Simulated principals (claimed via the real keystone_claim_membership
-- RPC, so the email-keyed invite path is under test too):
--   owner_a@practice-a.test        owner of practice_a
--   consultant_a@practice-a.test   consultant of practice_a
--   member_a1@client-a.test        client_member of client_a1 (practice_a)
--   member_a1c@client-a.test       SECOND client_member of client_a1 (the
--                                  teammate/buyer persona for the V2-4
--                                  homework wall: same client, not the
--                                  assignee, reads zero loop rows)
--   member_a2@client-a2.test       client_member of client_a2 (practice_a)
--   member_b@client-b.test         client_member of client_b (practice_b)
--   stranger@example.test          valid session, NO membership
--   anon                           no session at all

-- ── Setup: auth users ────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner_a@practice-a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'consultant_a@practice-a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'member_a1@client-a.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'member_a1c@client-a.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'member_a2@client-a2.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'member_b@client-b.test'),
  ('00000000-0000-0000-0000-0000000000ee', 'stranger@example.test')
on conflict do nothing;

-- ── Seed rows (superuser here = the service role in production) ─────
insert into practices (id, name, slug) values
  ('10000000-0000-0000-0000-00000000000a', 'Practice A', 'practice-a'),
  ('10000000-0000-0000-0000-00000000000b', 'Practice B', 'practice-b');

insert into clients (id, practice_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Client A1'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Client A2'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Client B');

-- Email-keyed PENDING memberships: user_id null until claimed.
insert into practice_members (practice_id, email, role) values
  ('10000000-0000-0000-0000-00000000000a', 'owner_a@practice-a.test', 'owner'),
  ('10000000-0000-0000-0000-00000000000a', 'consultant_a@practice-a.test', 'consultant');
insert into client_members (client_id, practice_id, email) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'member_a1@client-a.test'),
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'member_a1c@client-a.test'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'member_a2@client-a2.test'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'member_b@client-b.test');

-- practice_b needs its own operator so the cross-practice write wall is
-- provable in both directions.
insert into practice_members (practice_id, email, role) values
  ('10000000-0000-0000-0000-00000000000b', 'owner_b@practice-b.test', 'owner');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000bb', 'owner_b@practice-b.test')
on conflict do nothing;

insert into engagements (id, practice_id, client_id, title) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', 'Engagement A1'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a2', 'Engagement A2'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '20000000-0000-0000-0000-0000000000b1', 'Engagement B');

insert into workstreams (id, engagement_id, practice_id, client_id, title, stage, sort) values
  ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'Workstream A1', 'design', 0),
  ('40000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a2',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2',
   'Workstream A2', 'diagnose', 0),
  ('40000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1',
   'Workstream B', 'build', 0);

insert into workstream_stage_events
  (workstream_id, engagement_id, practice_id, client_id, from_stage, to_stage) values
  ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'diagnose', 'design'),
  ('40000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1',
   'design', 'build');

-- Ring 2: sessions, availability windows, and the token store.
insert into sessions (id, engagement_id, practice_id, client_id, starts_at, ends_at, tz) values
  ('50000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   now() + interval '3 days', now() + interval '3 days 1 hour', 'America/Los_Angeles'),
  ('50000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1',
   now() + interval '4 days', now() + interval '4 days 1 hour', 'America/Los_Angeles');

insert into availability_windows (practice_id, practice_member_id, weekday, start_min, end_min, tz)
select '10000000-0000-0000-0000-00000000000a', id, 1, 540, 720, 'America/Los_Angeles'
from practice_members
where practice_id = '10000000-0000-0000-0000-00000000000a' and role = 'owner';

insert into google_connections (practice_id, practice_member_id, google_email, refresh_token_enc)
select '10000000-0000-0000-0000-00000000000a', id, 'leak-test@gmail.test', 'kge1:enc:enc:enc'
from practice_members
where practice_id = '10000000-0000-0000-0000-00000000000a' and role = 'owner';

-- Ring 3: notes (one unshared, one shared), items, a proposal, and a
-- readiness marker, all in practice_a.
insert into session_notes (session_id, engagement_id, practice_id, client_id,
                           raw_transcript, summary_md, visibility) values
  ('50000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'leak-test transcript', 'unshared summary', 'practice');

insert into action_items (id, engagement_id, practice_id, client_id, title,
                          assigned_client_member_id, status) values
  ('60000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'member_a1 homework',
   (select id from client_members where email = 'member_a1@client-a.test'), 'open'),
  ('60000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'unassigned item', null, 'open'),
  ('60000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'member_a1 review homework (V2 3C)',
   (select id from client_members where email = 'member_a1@client-a.test'), 'open'),
  ('60000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1',
   'client_b homework',
   (select id from client_members where email = 'member_b@client-b.test'), 'open');

-- V2 3C: the a3 item runs the review loop; a4 is an internal practice
-- task that must never reach a client session (the audience wall).
update action_items set review_requested = true, body_md = 'review-mode body'
  where id = '60000000-0000-0000-0000-0000000000a3';
insert into action_items (id, engagement_id, practice_id, client_id, title,
                          audience, assigned_practice_member_id, status) values
  ('60000000-0000-0000-0000-0000000000a4', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'internal practice task (V2 3C wall)', 'practice',
   (select id from practice_members where email = 'owner_a@practice-a.test'), 'open');

-- One trail row seeded up front, so every wall check downstream (the
-- teammate, the other client, the other practice, the REVOKED coachee)
-- has a real row to leak.
insert into homework_activity (action_item_id, engagement_id, practice_id, client_id,
                               author_client_member_id, kind, body_md)
  select '60000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a1',
         '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
         id, 'comment', 'leak-test trail row'
  from client_members where email = 'member_a1@client-a.test';

insert into ai_proposals (engagement_id, practice_id, client_id, session_id, kind, payload) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1',
   'extraction', '{"summary_md":"leak-test"}');

insert into readiness_markers (engagement_id, practice_id, client_id, pillar, note_md) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', 'execution', 'leak-test readiness prose');

-- Service-role-only rows that must be invisible to every session.
insert into ai_spend_ledger (practice_id, model, tier, cost_usd)
  values ('10000000-0000-0000-0000-00000000000a', 'leak-test', 'default', 0.01);
insert into voice_violations (practice_id, source, violations)
  values ('10000000-0000-0000-0000-00000000000a', 'leak-test', '{em_dash}');
insert into audit_log (actor_email, action) values ('leak-test@test', 'leak-test');
insert into rate_limit_hits (bucket) values ('leak-test:bucket');

-- ── Claim: the email-keyed invite path ───────────────────────────────
set role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
select keystone_claim_membership();
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","email":"consultant_a@practice-a.test"}', false);
select keystone_claim_membership();
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
select keystone_claim_membership();
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","email":"member_a1c@client-a.test"}', false);
select keystone_claim_membership();
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
select keystone_claim_membership();
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"member_b@client-b.test"}', false);
select keystone_claim_membership();
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
select keystone_claim_membership();
-- The stranger claims too: with no pending row, nothing may link.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ee","email":"stranger@example.test"}', false);
select keystone_claim_membership();

reset role;
do $$ begin
  if (select count(*) from practice_members where user_id is not null) <> 3 then
    raise exception 'claim did not link exactly the three practice members';
  end if;
  if (select count(*) from client_members where user_id is not null) <> 4 then
    raise exception 'claim did not link exactly the four client members';
  end if;
end $$;
set role authenticated;

-- ── Owner A: full read of practice_a, nothing of practice_b ─────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);

do $$ begin
  if (select count(*) from practices) <> 1 then raise exception 'owner_a practice visibility wrong'; end if;
  if (select count(*) from clients) <> 2 then raise exception 'owner_a must see both practice_a clients'; end if;
  if (select count(*) from engagements) <> 2 then raise exception 'owner_a engagement visibility wrong'; end if;
  -- cross-practice: zero practice_b rows.
  if (select count(*) from engagements where practice_id = '10000000-0000-0000-0000-00000000000b') <> 0 then
    raise exception 'LEAK cross-practice: owner_a reads practice_b engagements';
  end if;
  -- Ring 2: the owner sees both dimensions of their own practice only.
  if (select count(*) from sessions) <> 1 then raise exception 'owner_a session visibility wrong'; end if;
  if (select count(*) from availability_windows) <> 1 then raise exception 'owner_a window visibility wrong'; end if;
  -- Ring 3: the workshop side sees everything of its practice,
  -- including the unshared note, the proposal queue, and readiness.
  if (select count(*) from session_notes) <> 1 then raise exception 'owner_a note visibility wrong'; end if;
  if (select count(*) from ai_proposals) <> 1 then raise exception 'owner_a proposal visibility wrong'; end if;
  if (select count(*) from readiness_markers) <> 1 then raise exception 'owner_a readiness visibility wrong'; end if;
  if (select count(*) from action_items) <> 4 then raise exception 'owner_a item visibility wrong'; end if;
  -- Service-role-only tables: even the owner sees nothing.
  if (select count(*) from google_connections) <> 0 then raise exception 'LEAK: session reads google_connections (token store)'; end if;
  if (select count(*) from ai_spend_ledger) <> 0 then raise exception 'LEAK: session reads ai_spend_ledger'; end if;
  if (select count(*) from voice_violations) <> 0 then raise exception 'LEAK: session reads voice_violations'; end if;
  if (select count(*) from audit_log) <> 0 then raise exception 'LEAK: session reads audit_log'; end if;
  if (select count(*) from rate_limit_hits) <> 0 then raise exception 'LEAK: session reads rate_limit_hits'; end if;
  -- Owner writes pass.
  insert into workstream_stage_events (workstream_id, engagement_id, practice_id, client_id, from_stage, to_stage)
    values ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            'design', 'build');
end $$;

-- Owner A cannot write into practice_b (cross-practice write wall).
do $$ begin
  insert into workstreams (engagement_id, practice_id, client_id, title)
    values ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
            '20000000-0000-0000-0000-0000000000b1', 'intruder');
  raise exception 'LEAK cross-practice: owner_a wrote a practice_b workstream';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

-- ── Consultant A: reads all of practice_a, writes engagements ───────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","email":"consultant_a@practice-a.test"}', false);

do $$ begin
  if (select count(*) from engagements) <> 2 then raise exception 'consultant_a engagement visibility wrong'; end if;
  insert into workstreams (engagement_id, practice_id, client_id, title)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', 'consultant-write');
end $$;

-- A consultant is not an owner: member management is blocked.
do $$ begin
  insert into practice_members (practice_id, email, role)
    values ('10000000-0000-0000-0000-00000000000a', 'sneaky@practice-a.test', 'consultant');
  raise exception 'LEAK role: consultant_a managed members (owner-only permission)';
exception when insufficient_privilege then null;
end $$;

-- ── Client member A1: exactly client_a1's slice, nothing else ────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);

do $$ begin
  if (select count(*) from practices) <> 1 then raise exception 'member_a1 must read own practice row only'; end if;
  if (select count(*) from clients) <> 1 then raise exception 'member_a1 must see exactly one client'; end if;
  if (select count(*) from engagements) <> 1 then raise exception 'member_a1 must see exactly one engagement'; end if;
  -- cross-client INSIDE the same practice: zero client_a2 rows.
  if (select count(*) from engagements where client_id = '20000000-0000-0000-0000-0000000000a2') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads client_a2 engagements inside the same practice';
  end if;
  if (select count(*) from workstreams where client_id <> '20000000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads another client''s workstreams';
  end if;
  if (select count(*) from workstream_stage_events where client_id <> '20000000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads another client''s stage events';
  end if;
  if (select count(*) from client_members where client_id <> '20000000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads another client''s roster';
  end if;
  -- cross-practice: zero practice_b rows anywhere.
  if (select count(*) from engagements where practice_id = '10000000-0000-0000-0000-00000000000b') <> 0 then
    raise exception 'LEAK cross-practice: member_a1 reads practice_b engagements';
  end if;
  -- Ring 2: sessions honor both dimensions; windows are practice-wide by
  -- design; the token store stays invisible.
  if (select count(*) from sessions) <> 1 then raise exception 'member_a1 session visibility wrong'; end if;
  if (select count(*) from sessions where client_id <> '20000000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads another client''s sessions';
  end if;
  if (select count(*) from availability_windows) <> 1 then
    raise exception 'member_a1 must read practice_a windows to book';
  end if;
  if (select count(*) from google_connections) <> 0 then
    raise exception 'LEAK: client member reads google_connections';
  end if;
  -- The busy-interval function discloses intervals only, both dims of
  -- the practice, nothing of practice_b.
  if (select count(*) from keystone_busy_intervals('10000000-0000-0000-0000-00000000000a')) <> 1 then
    raise exception 'member_a1 busy intervals wrong for own practice';
  end if;
  if (select count(*) from keystone_busy_intervals('10000000-0000-0000-0000-00000000000b')) <> 0 then
    raise exception 'LEAK cross-practice: member_a1 reads practice_b busy intervals';
  end if;
  -- Ring 3: an UNSHARED note (and its transcript) is invisible to the
  -- client; proposals and readiness are invisible always; items show
  -- the whole engagement but only their client's.
  if (select count(*) from session_notes) <> 0 then
    raise exception 'LEAK: client member reads an unshared session note';
  end if;
  if (select count(*) from ai_proposals) <> 0 then
    raise exception 'LEAK: client member reads ai_proposals';
  end if;
  if (select count(*) from readiness_markers) <> 0 then
    raise exception 'LEAK: client member reads readiness_markers (consultant-only lens)';
  end if;
  if (select count(*) from action_items) <> 3 then
    raise exception 'member_a1 must see their client''s three client-audience items';
  end if;
  if (select count(*) from action_items where client_id <> '20000000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads another client''s items';
  end if;
  -- V2 3C audience wall: the internal practice task never renders.
  if (select count(*) from action_items where audience = 'practice') <> 0 then
    raise exception 'LEAK: client member reads an internal practice task';
  end if;
end $$;

-- Ring 3: check-off is assignment-scoped. Own item: works. The
-- unassigned item of the same client: zero rows updated, no error.
do $$ begin
  update action_items set status = 'done', done_at = now()
    where id = '60000000-0000-0000-0000-0000000000a1';
  if not found then raise exception 'member_a1 could not check off their own item'; end if;
  update action_items set status = 'done', done_at = now()
    where id = '60000000-0000-0000-0000-0000000000a2';
  if found then raise exception 'LEAK role: member_a1 updated an item not assigned to them'; end if;
end $$;

-- After the consultant publishes (shares) the note, the client reads it.
reset role;
update session_notes set visibility = 'shared', summary_md = 'shared summary'
  where session_id = '50000000-0000-0000-0000-0000000000a1';
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from session_notes) <> 1 then
    raise exception 'member_a1 must read the SHARED note';
  end if;
end $$;

-- Ring 2: a client member books within their own client...
do $$ begin
  insert into sessions (engagement_id, practice_id, client_id, starts_at, ends_at, tz, created_by)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1',
            now() + interval '10 days', now() + interval '10 days 1 hour',
            'America/Los_Angeles', '00000000-0000-0000-0000-0000000000a1');
end $$;
-- ...but never for the OTHER client of the same practice (cross-client
-- write wall), and never overlapping a live session (the exclusion
-- constraint).
do $$ begin
  insert into sessions (engagement_id, practice_id, client_id, starts_at, ends_at, tz)
    values ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a2',
            now() + interval '11 days', now() + interval '11 days 1 hour', 'America/Los_Angeles');
  raise exception 'LEAK cross-client: member_a1 booked a session for client_a2';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into sessions (engagement_id, practice_id, client_id, starts_at, ends_at, tz)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1',
            now() + interval '10 days', now() + interval '10 days 1 hour', 'America/Los_Angeles');
  raise exception 'HOLE: the double-booking exclusion constraint did not fire';
exception when exclusion_violation then null;
end $$;

-- A client member watches; they do not write the spine (Ring 1).
do $$ begin
  insert into workstreams (engagement_id, practice_id, client_id, title)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', 'client-intruder');
  raise exception 'LEAK role: client member wrote a workstream';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update engagements set title = 'defaced' where id = '30000000-0000-0000-0000-0000000000a1';
  if found then raise exception 'LEAK role: client member updated an engagement'; end if;
end $$;

-- ── Client member A2: the mirror slice (the other same-practice client) ─
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);

do $$ begin
  if (select count(*) from engagements) <> 1 then raise exception 'member_a2 must see exactly one engagement'; end if;
  if (select count(*) from engagements where client_id = '20000000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 engagements inside the same practice';
  end if;
end $$;

-- ── Client member B: cross-practice zero in both directions ─────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"member_b@client-b.test"}', false);

do $$ begin
  if (select count(*) from engagements) <> 1 then raise exception 'member_b must see exactly one engagement'; end if;
  if (select count(*) from engagements where practice_id = '10000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice_a engagements';
  end if;
  if (select count(*) from clients where practice_id = '10000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice_a clients';
  end if;
  -- Ring 2 cross-practice: no practice_a sessions or windows.
  if (select count(*) from sessions where practice_id = '10000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice_a sessions';
  end if;
  if (select count(*) from availability_windows) <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice_a windows';
  end if;
  -- Ring 3 cross-practice: only their own item; zero practice_a notes,
  -- proposals, readiness.
  if (select count(*) from action_items) <> 1 then raise exception 'member_b item visibility wrong'; end if;
  if (select count(*) from session_notes) <> 0 then raise exception 'LEAK cross-practice: member_b reads practice_a notes'; end if;
  if (select count(*) from ai_proposals) <> 0 then raise exception 'LEAK: member_b reads proposals'; end if;
  if (select count(*) from readiness_markers) <> 0 then raise exception 'LEAK: member_b reads readiness'; end if;
end $$;

-- ── Stranger: valid session, no membership, zero rows everywhere ─────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ee","email":"stranger@example.test"}', false);

do $$ begin
  if (select count(*) from practices) <> 0 then raise exception 'LEAK: stranger reads practices'; end if;
  if (select count(*) from clients) <> 0 then raise exception 'LEAK: stranger reads clients'; end if;
  if (select count(*) from engagements) <> 0 then raise exception 'LEAK: stranger reads engagements'; end if;
  if (select count(*) from workstreams) <> 0 then raise exception 'LEAK: stranger reads workstreams'; end if;
  if (select count(*) from client_members) <> 0 then raise exception 'LEAK: stranger reads client_members'; end if;
  if (select count(*) from practice_members) <> 0 then raise exception 'LEAK: stranger reads practice_members'; end if;
end $$;

-- ── Anon: no session at all, zero rows ───────────────────────────────
select set_config('request.jwt.claims', '', false);
reset role;
set role anon;

do $$ begin
  if (select count(*) from practices) <> 0 then raise exception 'LEAK: anon reads practices'; end if;
  if (select count(*) from engagements) <> 0 then raise exception 'LEAK: anon reads engagements'; end if;
  if (select count(*) from workstreams) <> 0 then raise exception 'LEAK: anon reads workstreams'; end if;
end $$;

reset role;

-- ── Ring 4: deliverables, resources, prep links, storage paths ───────

-- Seed as the platform (superuser stands in for the service role):
-- two resources for practice A and one for B, one deliverable per
-- client, a prep link on client A1's upcoming session, and storage
-- objects under the scoped path convention.
insert into resources (id, practice_id, title, kind, body_md) values
  ('70000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   'Session prep guide', 'guide', 'guide body'),
  ('70000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
   'Meeting framework', 'framework', 'framework body'),
  ('70000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   'Practice B guide', 'guide', 'b body');

insert into deliverables (id, engagement_id, practice_id, client_id, title, kind, url) values
  ('80000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'Donor journey map', 'link', 'https://example.test/a1'),
  ('80000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a2',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a2',
   'A2 artifact', 'link', 'https://example.test/a2'),
  ('80000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1',
   'B artifact', 'link', 'https://example.test/b1');

insert into session_prep_resources (session_id, resource_id, practice_id, client_id) values
  ('50000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1');

insert into storage.buckets (id, name, public) values
  ('deliverables', 'deliverables', false), ('resources', 'resources', false)
on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values
  ('deliverables', '10000000-0000-0000-0000-00000000000a/20000000-0000-0000-0000-0000000000a1/30000000-0000-0000-0000-0000000000a1/x/map.pdf'),
  ('deliverables', '10000000-0000-0000-0000-00000000000a/20000000-0000-0000-0000-0000000000a2/30000000-0000-0000-0000-0000000000a2/x/a2.pdf'),
  ('deliverables', '10000000-0000-0000-0000-00000000000b/20000000-0000-0000-0000-0000000000b1/30000000-0000-0000-0000-0000000000b1/x/b.pdf'),
  ('resources', '10000000-0000-0000-0000-00000000000a/x/guide.pdf'),
  ('resources', '10000000-0000-0000-0000-00000000000b/x/bguide.pdf'),
  ('deliverables', 'not-a-uuid/junk/file.pdf');

-- Consultant A: reads the whole practice tree, writes resources, never
-- across the practice wall.
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","email":"consultant_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from deliverables) <> 2 then
    raise exception 'consultant_a must read both practice A deliverables';
  end if;
  if (select count(*) from resources) <> 2 then
    raise exception 'consultant_a must read both practice A resources';
  end if;
  insert into resources (practice_id, title, kind, body_md)
    values ('10000000-0000-0000-0000-00000000000a', 'consultant-authored', 'template', 'body');
  delete from resources where title = 'consultant-authored';
end $$;
do $$ begin
  insert into resources (practice_id, title, kind, body_md)
    values ('10000000-0000-0000-0000-00000000000b', 'cross-practice-intruder', 'guide', 'x');
  raise exception 'LEAK cross-practice: consultant_a authored a resource for practice B';
exception when insufficient_privilege then null;
end $$;

-- Client member A1: own deliverables and prep, the practice-wide
-- catalog, never the sibling client's artifacts, never a write.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from deliverables) <> 1 then
    raise exception 'member_a1 must see exactly their own deliverable';
  end if;
  if (select count(*) from deliverables where client_id = '20000000-0000-0000-0000-0000000000a2') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads client_a2 deliverables';
  end if;
  -- The catalog is practice-wide by design (spec 5.1): both A resources.
  if (select count(*) from resources) <> 2 then
    raise exception 'member_a1 must read the practice A catalog';
  end if;
  if (select count(*) from resources where practice_id = '10000000-0000-0000-0000-00000000000b') <> 0 then
    raise exception 'LEAK cross-practice: member_a1 reads practice B resources';
  end if;
  if (select count(*) from session_prep_resources) <> 1 then
    raise exception 'member_a1 must see the prep link on their session';
  end if;
end $$;
do $$ begin
  insert into deliverables (engagement_id, practice_id, client_id, title, kind, url)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', 'client-intruder', 'link', 'https://x.test');
  raise exception 'LEAK role: client member wrote a deliverable';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into resources (practice_id, title, kind, body_md)
    values ('10000000-0000-0000-0000-00000000000a', 'client-intruder', 'guide', 'x');
  raise exception 'LEAK role: client member authored a resource';
exception when insufficient_privilege then null;
end $$;
-- Storage: their client folder only; the practice-wide resources
-- folder; the malformed path resolves to no scope, not an error.
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'deliverables') <> 1 then
    raise exception 'member_a1 must see exactly their own storage object';
  end if;
  if (select count(*) from storage.objects
      where bucket_id = 'deliverables'
        and name like '%/20000000-0000-0000-0000-0000000000a2/%') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads client_a2 storage objects';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'resources') <> 1 then
    raise exception 'member_a1 must see only practice A resource objects';
  end if;
end $$;

-- Client member A2: the mirror; the shared catalog, own artifact only,
-- and no view of which resources sibling engagements were handed.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$ begin
  if (select count(*) from deliverables) <> 1 then
    raise exception 'member_a2 must see exactly their own deliverable';
  end if;
  if (select count(*) from resources) <> 2 then
    raise exception 'member_a2 must read the practice A catalog';
  end if;
  if (select count(*) from session_prep_resources) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 prep links';
  end if;
end $$;

-- Client member B: cross-practice zero in both directions.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"member_b@client-b.test"}', false);
do $$ begin
  if (select count(*) from deliverables where practice_id = '10000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice A deliverables';
  end if;
  if (select count(*) from resources where practice_id = '10000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice A resources';
  end if;
  if (select count(*) from resources) <> 1 then
    raise exception 'member_b must read the practice B catalog';
  end if;
  if (select count(*) from session_prep_resources) <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice A prep links';
  end if;
  if (select count(*) from storage.objects
      where name like '10000000-0000-0000-0000-00000000000a/%') <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice A storage objects';
  end if;
end $$;

-- Stranger: zero rows in every Ring 4 surface.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ee","email":"stranger@example.test"}', false);
do $$ begin
  if (select count(*) from deliverables) <> 0 then raise exception 'LEAK: stranger reads deliverables'; end if;
  if (select count(*) from resources) <> 0 then raise exception 'LEAK: stranger reads resources'; end if;
  if (select count(*) from session_prep_resources) <> 0 then raise exception 'LEAK: stranger reads prep links'; end if;
  if (select count(*) from storage.objects) <> 0 then raise exception 'LEAK: stranger reads storage objects'; end if;
end $$;

reset role;

-- ── Ring 5: message threads, authorship, read receipts, notify RPC ───

-- Client member A1 opens the thread and speaks (both writes ride the
-- session, through the permission authority).
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
insert into message_threads (id, engagement_id, practice_id, client_id) values
  ('90000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1');
insert into messages (id, thread_id, engagement_id, practice_id, client_id,
                      author_user_id, author_side, body) values
  ('91000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000a1',
   '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1',
   'client', 'a question from the client');

-- Never as someone else, never from the practice side of the wall, and
-- never a thread for the sibling client.
do $$ begin
  insert into messages (thread_id, engagement_id, practice_id, client_id,
                        author_user_id, author_side, body)
    values ('90000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-0000000000a2', 'client', 'forged author');
  raise exception 'LEAK authorship: member_a1 wrote as member_a2';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into messages (thread_id, engagement_id, practice_id, client_id,
                        author_user_id, author_side, body)
    values ('90000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-0000000000a1', 'practice', 'wrong wall');
  raise exception 'LEAK side: client member wrote as the practice';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into message_threads (engagement_id, practice_id, client_id)
    values ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a2');
  raise exception 'LEAK cross-client: member_a1 opened a thread for client_a2';
exception when insufficient_privilege then null;
end $$;

-- The notify RPC: their own engagement yields the owner email, the
-- sibling engagement yields zero rows.
do $$ begin
  if (select count(*) from keystone_message_notify_targets('30000000-0000-0000-0000-0000000000a1')) <> 1 then
    raise exception 'member_a1 must get exactly the owner email for their engagement';
  end if;
  if (select count(*) from keystone_message_notify_targets('30000000-0000-0000-0000-0000000000a2')) <> 0 then
    raise exception 'LEAK cross-client: notify targets for a sibling engagement';
  end if;
end $$;

-- Consultant A replies and the reply marks the client message read; the
-- body itself is immutable to every session (column-level grant).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","email":"consultant_a@practice-a.test"}', false);
insert into messages (thread_id, engagement_id, practice_id, client_id,
                      author_user_id, author_side, body) values
  ('90000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000000b', 'practice', 'the reply');
update messages set read_at = now()
  where id = '91000000-0000-0000-0000-0000000000a1' and read_at is null;
do $$ begin
  if (select read_at from messages where id = '91000000-0000-0000-0000-0000000000a1') is null then
    raise exception 'the read receipt did not stick';
  end if;
end $$;
do $$ begin
  update messages set body = 'rewritten history'
    where id = '91000000-0000-0000-0000-0000000000a1';
  raise exception 'HOLE: a session rewrote a message body';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  delete from messages where id = '91000000-0000-0000-0000-0000000000a1';
  if found then raise exception 'HOLE: a session deleted a message'; end if;
end $$;

-- Member A2, member B, stranger: the thread does not exist for them.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$ begin
  if (select count(*) from message_threads) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 threads';
  end if;
  if (select count(*) from messages) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 messages';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"member_b@client-b.test"}', false);
do $$ begin
  if (select count(*) from messages) <> 0 then
    raise exception 'LEAK cross-practice: member_b reads practice_a messages';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ee","email":"stranger@example.test"}', false);
do $$ begin
  if (select count(*) from message_threads) <> 0 then raise exception 'LEAK: stranger reads threads'; end if;
  if (select count(*) from messages) <> 0 then raise exception 'LEAK: stranger reads messages'; end if;
  if (select count(*) from keystone_message_notify_targets('30000000-0000-0000-0000-0000000000a1')) <> 0 then
    raise exception 'LEAK: stranger gets notify targets';
  end if;
end $$;

reset role;

-- ── Ring 6: digests (practice-only read, no session writes) ──────────

-- Seed as the platform: one approved digest per practice.
insert into digests (engagement_id, practice_id, client_id, week_of, subject, draft_md) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', '2026-07-06', 'This week at Client A1', 'a week'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b',
   '20000000-0000-0000-0000-0000000000b1', '2026-07-06', 'This week at Client B', 'b week');

set role authenticated;
-- Consultant A reads their practice's digest record and nothing else;
-- even the consultant cannot write it from a session (the approve
-- action goes through the service role after the check).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","email":"consultant_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from digests) <> 1 then
    raise exception 'consultant_a must read exactly their practice digest';
  end if;
end $$;
do $$ begin
  insert into digests (engagement_id, practice_id, client_id, week_of, subject, draft_md)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', '2026-07-13', 'forged', 'x');
  raise exception 'HOLE: a session wrote a digest row';
exception when insufficient_privilege then null;
end $$;

-- The client never meets the digest in-app: their copy is the email.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from digests) <> 0 then
    raise exception 'LEAK: a client member reads digests';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"member_b@client-b.test"}', false);
do $$ begin
  if (select count(*) from digests) <> 0 then
    raise exception 'LEAK: member_b reads digests';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ee","email":"stranger@example.test"}', false);
do $$ begin
  if (select count(*) from digests) <> 0 then raise exception 'LEAK: stranger reads digests'; end if;
end $$;

reset role;

-- ── V2 1A: revocation closes every wall (migration 0009) ────────────
-- Soft-deactivate consultant_a (practice side) and member_a1 (client
-- side) as the service role would, then assert both read zero rows
-- everywhere, the revoked consultant cannot write, a revoked pending
-- row cannot be claimed, and reactivation restores access.

update practice_members set revoked_at = now()
  where email = 'consultant_a@practice-a.test';
update client_members set revoked_at = now()
  where email = 'member_a1@client-a.test';

-- A revoked PENDING invite: signing in with the email must link nothing.
insert into client_members (client_id, practice_id, email, revoked_at) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   'revoked_pending@client-a.test', now());
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000dd', 'revoked_pending@client-a.test')
on conflict do nothing;

set role authenticated;

-- The revoked consultant: zero rows on every practice-scoped surface.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","email":"consultant_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from practices) <> 0 then raise exception 'LEAK: revoked consultant reads practices'; end if;
  if (select count(*) from clients) <> 0 then raise exception 'LEAK: revoked consultant reads clients'; end if;
  if (select count(*) from engagements) <> 0 then raise exception 'LEAK: revoked consultant reads engagements'; end if;
  if (select count(*) from workstreams) <> 0 then raise exception 'LEAK: revoked consultant reads workstreams'; end if;
  if (select count(*) from sessions) <> 0 then raise exception 'LEAK: revoked consultant reads sessions'; end if;
  if (select count(*) from session_notes) <> 0 then raise exception 'LEAK: revoked consultant reads notes'; end if;
  if (select count(*) from action_items) <> 0 then raise exception 'LEAK: revoked consultant reads action items'; end if;
  if (select count(*) from ai_proposals) <> 0 then raise exception 'LEAK: revoked consultant reads proposals'; end if;
  if (select count(*) from readiness_markers) <> 0 then raise exception 'LEAK: revoked consultant reads readiness'; end if;
  if (select count(*) from deliverables) <> 0 then raise exception 'LEAK: revoked consultant reads deliverables'; end if;
  if (select count(*) from resources) <> 0 then raise exception 'LEAK: revoked consultant reads resources'; end if;
  if (select count(*) from messages) <> 0 then raise exception 'LEAK: revoked consultant reads messages'; end if;
  if (select count(*) from digests) <> 0 then raise exception 'LEAK: revoked consultant reads digests'; end if;
end $$;
do $$ begin
  insert into workstream_stage_events (workstream_id, engagement_id, practice_id, client_id, from_stage, to_stage)
    values ('40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            'build', 'train');
  raise exception 'HOLE: a revoked consultant wrote a stage event';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

-- The revoked client member: zero rows, including their own homework.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from engagements) <> 0 then raise exception 'LEAK: revoked client member reads engagements'; end if;
  if (select count(*) from workstreams) <> 0 then raise exception 'LEAK: revoked client member reads workstreams'; end if;
  if (select count(*) from action_items) <> 0 then raise exception 'LEAK: revoked client member reads action items'; end if;
  if (select count(*) from homework_activity) <> 0 then raise exception 'LEAK: revoked client member reads their homework trail'; end if;
  if (select count(*) from session_notes) <> 0 then raise exception 'LEAK: revoked client member reads notes'; end if;
  if (select count(*) from deliverables) <> 0 then raise exception 'LEAK: revoked client member reads deliverables'; end if;
  if (select count(*) from messages) <> 0 then raise exception 'LEAK: revoked client member reads messages'; end if;
  if (select count(*) from keystone_message_notify_targets('30000000-0000-0000-0000-0000000000a1')) <> 0 then
    raise exception 'LEAK: revoked client member enumerates notify targets';
  end if;
end $$;

-- The revoked pending row: the claim links nothing.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000dd","email":"revoked_pending@client-a.test"}', false);
select keystone_claim_membership();
reset role;
do $$ begin
  if (select count(*) from client_members
      where email = 'revoked_pending@client-a.test' and user_id is not null) <> 0 then
    raise exception 'HOLE: a revoked pending invite was claimed';
  end if;
end $$;

-- Reactivation restores exactly the old access, nothing new.
update practice_members set revoked_at = null
  where email = 'consultant_a@practice-a.test';
update client_members set revoked_at = null
  where email = 'member_a1@client-a.test';
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","email":"consultant_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from engagements) <> 2 then
    raise exception 'reactivated consultant visibility wrong';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from engagements) <> 1 then
    raise exception 'reactivated client member visibility wrong';
  end if;
end $$;

reset role;

-- ── V2 1B: engagement_drafts are invisible to every client member ───
-- The builder's whole design rests on this: a draft for client_a1
-- must read zero even to a member of client_a1.

insert into engagement_drafts (id, practice_id, client_id, title, shape) values
  ('90000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', 'Draft for A1',
   '{"notes_md":"leak-test private scoping notes"}');

set role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from engagement_drafts) <> 1 then
    raise exception 'owner_a draft visibility wrong';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","email":"consultant_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from engagement_drafts) <> 1 then
    raise exception 'consultant_a draft visibility wrong';
  end if;
  -- engagement.write covers drafting.
  insert into engagement_drafts (practice_id, title)
    values ('10000000-0000-0000-0000-00000000000a', 'Consultant draft');
end $$;

-- The point of the design: the SAME client's member reads zero drafts.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from engagement_drafts) <> 0 then
    raise exception 'LEAK: a client member reads a draft about their own client';
  end if;
end $$;
do $$ begin
  insert into engagement_drafts (practice_id, client_id, title)
    values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1', 'forged');
  raise exception 'HOLE: a client member wrote an engagement draft';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"member_b@client-b.test"}', false);
do $$ begin
  if (select count(*) from engagement_drafts) <> 0 then raise exception 'LEAK: member_b reads drafts'; end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
do $$ begin
  if (select count(*) from engagement_drafts) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a drafts';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ee","email":"stranger@example.test"}', false);
do $$ begin
  if (select count(*) from engagement_drafts) <> 0 then raise exception 'LEAK: stranger reads drafts'; end if;
end $$;

-- No delete path for any session: discard is a status, never a delete.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$
declare n int;
begin
  delete from engagement_drafts where id = '90000000-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a session deleted an engagement draft'; end if;
end $$;

reset role;

-- ── Engagement documents: the visibility wall and both scope walls ──
-- Two documents in engagement A1: one shared, one not. The practice
-- sees both; member_a1 sees ONLY the shared one; everyone else zero.
-- Storage: the shared object readable by member_a1 through its row,
-- the unshared object unreadable even with the exact path.

insert into engagement_documents
  (id, engagement_id, practice_id, client_id, title, status, storage_path, file_name, visible_to_client) values
  ('a0000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'Consulting services agreement', 'signed',
   '10000000-0000-0000-0000-00000000000a/20000000-0000-0000-0000-0000000000a1/30000000-0000-0000-0000-0000000000a1/u1/agreement.pdf',
   'agreement.pdf', true),
  ('a0000000-0000-0000-0000-0000000000d2', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'Unshared draft', 'uploaded',
   '10000000-0000-0000-0000-00000000000a/20000000-0000-0000-0000-0000000000a1/30000000-0000-0000-0000-0000000000a1/u2/draft.pdf',
   'draft.pdf', false);
insert into storage.objects (bucket_id, name) values
  ('engagement-documents', '10000000-0000-0000-0000-00000000000a/20000000-0000-0000-0000-0000000000a1/30000000-0000-0000-0000-0000000000a1/u1/agreement.pdf'),
  ('engagement-documents', '10000000-0000-0000-0000-00000000000a/20000000-0000-0000-0000-0000000000a1/30000000-0000-0000-0000-0000000000a1/u2/draft.pdf');

set role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from engagement_documents) <> 2 then
    raise exception 'owner_a must see both documents, shared and not';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'engagement-documents') <> 2 then
    raise exception 'owner_a must read both document objects';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from engagement_documents) <> 1 then
    raise exception 'member_a1 must see exactly the shared document';
  end if;
  if (select count(*) from engagement_documents where visible_to_client = false) <> 0 then
    raise exception 'LEAK: a client member reads an unshared document';
  end if;
  if (select count(*) from storage.objects
      where bucket_id = 'engagement-documents' and name like '%u1/agreement.pdf') <> 1 then
    raise exception 'member_a1 must read the shared document object';
  end if;
  if (select count(*) from storage.objects
      where bucket_id = 'engagement-documents' and name like '%u2/draft.pdf') <> 0 then
    raise exception 'LEAK: a client member reads an UNSHARED document object by path';
  end if;
end $$;
do $$ begin
  insert into engagement_documents (engagement_id, practice_id, client_id, title, storage_path, file_name)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', 'forged', 'x/y', 'forged.pdf');
  raise exception 'HOLE: a client member wrote a document row';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;
do $$
declare n int;
begin
  update engagement_documents set visible_to_client = true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a client member flipped document visibility'; end if;
end $$;

-- Cross-client (same practice) and cross-practice: zero.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$ begin
  if (select count(*) from engagement_documents) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 documents';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'engagement-documents') <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 document objects';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
do $$ begin
  if (select count(*) from engagement_documents) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a documents';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'engagement-documents') <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a document objects';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ee","email":"stranger@example.test"}', false);
do $$ begin
  if (select count(*) from engagement_documents) <> 0 then
    raise exception 'LEAK: stranger reads documents';
  end if;
end $$;

reset role;

-- ── Charter and approvals (V2 2A + 5D) ──────────────────────────────
-- A published charter v1, a draft v2, and a pending sign-off request
-- in engagement A1. The client sees the published version and decides
-- the approval through pure RLS with identity stamped by trigger; the
-- draft stays invisible; decided rows are immutable; nothing deletes.

insert into engagement_charters (id, engagement_id, practice_id, client_id, version, body_md, status, published_at) values
  ('b0000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   1, 'charter v1 body', 'published', now()),
  ('b0000000-0000-0000-0000-0000000000c2', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   2, 'charter v2 draft, practice eyes only', 'draft', null);
insert into approvals (id, practice_id, client_id, engagement_id, subject_type, subject_id, subject_label) values
  ('c0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1',
   'charter', 'b0000000-0000-0000-0000-0000000000c1', 'the engagement charter, version 1');

set role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from engagement_charters) <> 2 then
    raise exception 'owner_a must see the draft and the published charter';
  end if;
  if (select count(*) from approvals) <> 1 then
    raise exception 'owner_a approval visibility wrong';
  end if;
end $$;
-- A session can never flip a draft to published: the transition is the
-- publish action's, service-role after the check.
do $$ begin
  update engagement_charters set status = 'published'
    where id = 'b0000000-0000-0000-0000-0000000000c2';
  raise exception 'HOLE: a session flipped a charter draft to published';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

-- The client member: published visible, draft invisible.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from engagement_charters) <> 1 then
    raise exception 'member_a1 must see exactly the published charter';
  end if;
  if (select count(*) from engagement_charters where status = 'draft') <> 0 then
    raise exception 'LEAK: a client member reads a charter draft';
  end if;
  if (select count(*) from approvals where status = 'pending') <> 1 then
    raise exception 'member_a1 must see their pending sign-off request';
  end if;
end $$;
-- The client cannot smuggle a decision into any other status.
do $$ begin
  update approvals set status = 'withdrawn'
    where id = 'c0000000-0000-0000-0000-0000000000a1';
  raise exception 'HOLE: a client member withdrew an approval';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;
-- The real decide: status only; identity stamped by trigger from the
-- verified JWT, never from the payload.
update approvals set status = 'approved', note_md = 'looks right'
  where id = 'c0000000-0000-0000-0000-0000000000a1';

reset role;
do $$ begin
  if (select count(*) from approvals
      where id = 'c0000000-0000-0000-0000-0000000000a1'
        and status = 'approved'
        and decided_by = '00000000-0000-0000-0000-0000000000a1'
        and decided_by_email = 'member_a1@client-a.test'
        and decided_at is not null) <> 1 then
    raise exception 'the decide did not stamp the decider from the session';
  end if;
end $$;
set role authenticated;

-- Decided rows are immutable to both sides: zero rows match the
-- pending-only update policies.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$
declare n int;
begin
  update approvals set status = 'not_yet' where id = 'c0000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a decided approval was re-decided'; end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$
declare n int;
begin
  update approvals set status = 'withdrawn' where id = 'c0000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: the practice rewrote a decided approval'; end if;
  delete from approvals where id = 'c0000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a session deleted an approval'; end if;
  delete from engagement_charters where id = 'b0000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a session deleted a charter version'; end if;
end $$;

-- Cross-client and cross-practice: zero on both tables.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$
declare n int;
begin
  if (select count(*) from engagement_charters) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 charters';
  end if;
  if (select count(*) from approvals) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 approvals';
  end if;
  -- And cannot decide a sibling client's approval even blind.
  update approvals set status = 'approved' where subject_type = 'charter';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: member_a2 decided a sibling approval'; end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
do $$ begin
  if (select count(*) from engagement_charters) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a charters';
  end if;
  if (select count(*) from approvals) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a approvals';
  end if;
end $$;

reset role;

-- ── Decision log (V2 2B): immutable rows, both walls ────────────────

insert into decisions (id, engagement_id, practice_id, client_id, decided_on, title, decided_by_label) values
  ('d0000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   '2026-07-07', 'Fundraising first', 'Susan and Remi');

set role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$
declare n int;
begin
  if (select count(*) from decisions) <> 1 then raise exception 'owner_a decision visibility wrong'; end if;
  -- Logged means logged: even the practice cannot rewrite or remove.
  update decisions set title = 'rewritten' where id = 'd0000000-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a session rewrote a logged decision'; end if;
  delete from decisions where id = 'd0000000-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a session deleted a logged decision'; end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$
declare n int;
begin
  if (select count(*) from decisions) <> 1 then
    raise exception 'member_a1 must read their engagement decisions';
  end if;
  update decisions set title = 'rewritten' where id = 'd0000000-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a client member rewrote a decision'; end if;
end $$;
do $$ begin
  insert into decisions (engagement_id, practice_id, client_id, decided_on, title)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', '2026-07-08', 'forged decision');
  raise exception 'HOLE: a client member logged a decision';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$ begin
  if (select count(*) from decisions) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 decisions';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
do $$ begin
  if (select count(*) from decisions) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a decisions';
  end if;
end $$;

reset role;

-- ── Workstream note (V2 2F): client-readable, practice-writable ─────

update workstreams set note_md = 'why we are here, said plainly', note_updated_at = now()
  where id = '40000000-0000-0000-0000-0000000000a1';

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$
declare n int;
begin
  if (select count(*) from workstreams where note_md is not null) <> 1 then
    raise exception 'member_a1 must read their workstream note';
  end if;
  update workstreams set note_md = 'forged note'
    where id = '40000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a client member wrote a workstream note'; end if;
end $$;

reset role;

-- ── Outcomes and evidence (V2 2C): both walls, humane writes ────────

insert into outcomes (id, engagement_id, practice_id, client_id, title, baseline_md, target_md) values
  ('e0000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'Pipeline live', 'No CRM', 'Pipeline running');
insert into outcome_evidence (id, outcome_id, engagement_id, practice_id, client_id, kind, ref_id) values
  ('e0000000-0000-0000-0000-0000000000f2', 'e0000000-0000-0000-0000-0000000000f1',
   '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', 'decision', 'd0000000-0000-0000-0000-0000000000e1');

set role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$
declare n int;
begin
  if (select count(*) from outcomes) <> 1 then
    raise exception 'member_a1 must read their engagement outcomes';
  end if;
  if (select count(*) from outcome_evidence) <> 1 then
    raise exception 'member_a1 must read the evidence trail';
  end if;
  update outcomes set standing_md = 'forged standing'
    where id = 'e0000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a client member wrote an outcome standing'; end if;
end $$;
do $$ begin
  insert into outcomes (engagement_id, practice_id, client_id, title)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', 'forged outcome');
  raise exception 'HOLE: a client member created an outcome';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$ begin
  if (select count(*) from outcomes) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 outcomes';
  end if;
  if (select count(*) from outcome_evidence) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 evidence';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
do $$ begin
  if (select count(*) from outcomes) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a outcomes';
  end if;
end $$;

-- The practice: outcomes never session-delete; a mistaken evidence
-- LINK may be removed (the artifact is untouched).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$
declare n int;
begin
  delete from outcomes where id = 'e0000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a session deleted an outcome'; end if;
  delete from outcome_evidence where id = 'e0000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'the practice must be able to remove a mistaken evidence link'; end if;
  if (select count(*) from decisions where id = 'd0000000-0000-0000-0000-0000000000e1') <> 1 then
    raise exception 'removing an evidence link must never touch the artifact';
  end if;
end $$;

reset role;

-- ── Q&A exchanges (V2 2E): deny-all to every session ────────────────

insert into qa_exchanges (engagement_id, practice_id, client_id, asker_side, question, answer_md) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1', 'client', 'leak-test question', 'leak-test answer');

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from qa_exchanges) <> 0 then
    raise exception 'LEAK: a session reads qa_exchanges (owner)';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from qa_exchanges) <> 0 then
    raise exception 'LEAK: a session reads qa_exchanges (client member, own question included)';
  end if;
end $$;
do $$ begin
  insert into qa_exchanges (engagement_id, practice_id, client_id, asker_side, question)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', 'client', 'forged');
  raise exception 'HOLE: a session wrote a qa exchange';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

reset role;

-- ── V2 3C: the homework loop and the V2-4 wall ───────────────────────
-- The loop state lives in homework_activity, and its read policy admits
-- the practice and the ASSIGNED coachee only. member_a1c (same client,
-- not the assignee: the teammate/buyer persona) reads zero rows, which
-- is the wall Remi decided firmly in V2-4. The trail is append-only for
-- every session, and a review item is never self-completed.

set role authenticated;

-- The coachee submits on their own review item (pure RLS insert).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  insert into homework_activity (action_item_id, engagement_id, practice_id, client_id,
                                 author_client_member_id, kind, body_md)
    values ('60000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            (select id from client_members where email = 'member_a1@client-a.test'),
            'submission', 'here is the draft');
  if (select count(*) from homework_activity) <> 2 then
    raise exception 'the coachee must read their own trail';
  end if;
end $$;

-- The coachee cannot self-complete a review item (check-off tightened).
do $$ begin
  update action_items set status = 'done', done_at = now()
    where id = '60000000-0000-0000-0000-0000000000a3';
  if found then raise exception 'HOLE: a coachee self-completed a review item'; end if;
end $$;

-- The coachee cannot write the trail of an item not assigned to them.
do $$ begin
  insert into homework_activity (action_item_id, engagement_id, practice_id, client_id,
                                 author_client_member_id, kind, body_md)
    values ('60000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            (select id from client_members where email = 'member_a1@client-a.test'),
            'comment', 'not mine');
  raise exception 'LEAK: a coachee wrote on an item not assigned to them';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

-- Forged authorship: writing as the teammate is denied.
do $$ begin
  insert into homework_activity (action_item_id, engagement_id, practice_id, client_id,
                                 author_client_member_id, kind, body_md)
    values ('60000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            (select id from client_members where email = 'member_a1c@client-a.test'),
            'comment', 'forged author');
  raise exception 'LEAK: a coachee forged trail authorship';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

-- Append-only, coachee side: no edit, no delete, even of your own row.
do $$ begin
  update homework_activity set body_md = 'rewritten history';
  if found then raise exception 'HOLE: a coachee rewrote the trail'; end if;
  delete from homework_activity;
  if found then raise exception 'HOLE: a coachee deleted the trail'; end if;
end $$;

-- The practice answers with a send-back through the mirror policy, and
-- the trail stays append-only for the practice session too.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from homework_activity) <> 2 then
    raise exception 'the practice must read the whole trail';
  end if;
  insert into homework_activity (action_item_id, engagement_id, practice_id, client_id,
                                 author_practice_member_id, kind, body_md)
    values ('60000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            (select id from practice_members where email = 'owner_a@practice-a.test'),
            'send_back', 'tighten the second section');
  update homework_activity set body_md = 'rewritten by the practice';
  if found then raise exception 'HOLE: a practice session rewrote the trail'; end if;
  delete from homework_activity;
  if found then raise exception 'HOLE: a practice session deleted the trail'; end if;
end $$;

-- The coachee reads the feedback (the loop is a conversation).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from homework_activity) <> 3 then
    raise exception 'the coachee must read the consultant''s feedback';
  end if;
end $$;

-- THE WALL (V2-4): the teammate of the SAME client sees the item row
-- but zero trail rows, and cannot write into the loop.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","email":"member_a1c@client-a.test"}', false);
do $$ begin
  if (select count(*) from action_items where id = '60000000-0000-0000-0000-0000000000a3') <> 1 then
    raise exception 'the teammate must still see the item row (open/done is shared)';
  end if;
  if (select count(*) from homework_activity) <> 0 then
    raise exception 'LEAK V2-4: a teammate reads a coachee''s homework trail';
  end if;
end $$;
do $$ begin
  insert into homework_activity (action_item_id, engagement_id, practice_id, client_id,
                                 author_client_member_id, kind, body_md)
    values ('60000000-0000-0000-0000-0000000000a3', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            (select id from client_members where email = 'member_a1c@client-a.test'),
            'comment', 'butting in');
  raise exception 'LEAK V2-4: a teammate wrote into a coachee''s loop';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

-- Cross-client and cross-practice: zero trail rows.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$ begin
  if (select count(*) from homework_activity) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 homework trail';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
do $$ begin
  if (select count(*) from homework_activity) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a homework trail';
  end if;
end $$;

reset role;

-- ── V2 3H: session polls (group scheduling) ──────────────────────────
-- Polls and options are practice-written and read by both sides; marks
-- are the one client write: self-authored, on your own client's OPEN
-- poll only, retractable while open, never someone else's. The tally
-- is visible with names by design (gate 3H-2), so a teammate's mark
-- being READABLE is asserted as much as a forged mark being denied.

insert into session_polls (id, engagement_id, practice_id, client_id, purpose) values
  ('a1000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
   'leak-test poll');
insert into session_poll_options (id, poll_id, engagement_id, practice_id, client_id,
                                  starts_at, ends_at, tz, sort) values
  ('a1000000-0000-0000-0000-0000000000f2', 'a1000000-0000-0000-0000-0000000000f1',
   '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1',
   now() + interval '20 days', now() + interval '20 days 1 hour', 'America/Los_Angeles', 0),
  ('a1000000-0000-0000-0000-0000000000f3', 'a1000000-0000-0000-0000-0000000000f1',
   '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a1',
   now() + interval '21 days', now() + interval '21 days 1 hour', 'America/Los_Angeles', 1);
insert into session_poll_marks (poll_id, option_id, engagement_id, practice_id, client_id,
                                client_member_id)
  select 'a1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f2',
         '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
         '20000000-0000-0000-0000-0000000000a1', id
  from client_members where email = 'member_a1c@client-a.test';

set role authenticated;

-- The coachee: reads the poll and the teammate's mark (the tally),
-- marks as themselves, and every dishonest write is denied.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from session_polls) <> 1 then
    raise exception 'member_a1 must read their open poll';
  end if;
  if (select count(*) from session_poll_options) <> 2 then
    raise exception 'member_a1 must read the poll options';
  end if;
  if (select count(*) from session_poll_marks) <> 1 then
    raise exception 'member_a1 must read the teammate''s mark (the tally has names)';
  end if;
  insert into session_poll_marks (poll_id, option_id, engagement_id, practice_id, client_id,
                                  client_member_id)
    select 'a1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f2',
           '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
           '20000000-0000-0000-0000-0000000000a1', id
    from client_members where email = 'member_a1@client-a.test';
end $$;
do $$ begin
  insert into session_poll_marks (poll_id, option_id, engagement_id, practice_id, client_id,
                                  client_member_id)
    select 'a1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f3',
           '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
           '20000000-0000-0000-0000-0000000000a1', id
    from client_members where email = 'member_a1c@client-a.test';
  raise exception 'LEAK: a member forged a teammate''s poll mark';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;
do $$
declare n int;
begin
  -- A teammate's mark is not yours to remove.
  delete from session_poll_marks
    where client_member_id = (select id from client_members where email = 'member_a1c@client-a.test');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK: a member deleted a teammate''s poll mark'; end if;
  -- Your own is (changed my mind, while the poll is open).
  delete from session_poll_marks
    where client_member_id = (select id from client_members where email = 'member_a1@client-a.test');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'a member must be able to retract their own mark'; end if;
  insert into session_poll_marks (poll_id, option_id, engagement_id, practice_id, client_id,
                                  client_member_id)
    select 'a1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f2',
           '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
           '20000000-0000-0000-0000-0000000000a1', id
    from client_members where email = 'member_a1@client-a.test';
end $$;
-- A client member never creates polls or options (gate 3H-5).
do $$ begin
  insert into session_polls (engagement_id, practice_id, client_id, purpose)
    values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
            '20000000-0000-0000-0000-0000000000a1', 'client-made poll');
  raise exception 'LEAK: a client member created a poll';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;
do $$ begin
  insert into session_poll_options (poll_id, engagement_id, practice_id, client_id,
                                    starts_at, ends_at, tz)
    values ('a1000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000a1',
            '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
            now() + interval '22 days', now() + interval '22 days 1 hour', 'America/Los_Angeles');
  raise exception 'LEAK: a client member added a poll option';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

-- Cross-client and cross-practice: zero rows on all three tables.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$ begin
  if (select count(*) from session_polls) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 polls';
  end if;
  if (select count(*) from session_poll_options) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 poll options';
  end if;
  if (select count(*) from session_poll_marks) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 poll marks';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
do $$ begin
  if (select count(*) from session_polls) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a polls';
  end if;
  if (select count(*) from session_poll_marks) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a poll marks';
  end if;
end $$;

-- The practice closes the poll through its session; a closed poll
-- accepts no new marks and releases none.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$ begin
  update session_polls set status = 'closed', closed_at = now()
    where id = 'a1000000-0000-0000-0000-0000000000f1';
  if not found then raise exception 'the practice must be able to close its poll'; end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  insert into session_poll_marks (poll_id, option_id, engagement_id, practice_id, client_id,
                                  client_member_id)
    select 'a1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f3',
           '30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a',
           '20000000-0000-0000-0000-0000000000a1', id
    from client_members where email = 'member_a1@client-a.test';
  raise exception 'HOLE: a mark landed on a closed poll';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;
do $$
declare n int;
begin
  delete from session_poll_marks
    where client_member_id = (select id from client_members where email = 'member_a1@client-a.test');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a mark was retracted from a closed poll'; end if;
end $$;

reset role;

-- ── V2 3A: the AI payload is immutable, for every writer ─────────────
-- The trigger fires regardless of role: even the service role (the
-- superuser here) cannot rewrite what the AI said. Edits belong in
-- edited_payload, which updates freely. A practice session cannot
-- touch the row at all (no session write policies since Ring 3).

do $$ begin
  update ai_proposals set payload = '{"summary_md":"rewritten history"}'::jsonb;
  raise exception 'HOLE: ai_proposals.payload was rewritten';
exception when raise_exception then null; -- the immutability trigger fired
end $$;
do $$ begin
  update ai_proposals set edited_payload = '{"summary_md":"the human copy"}'::jsonb;
  if not found then raise exception 'edited_payload must accept the human copy'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$ begin
  update ai_proposals set edited_payload = '{"summary_md":"session write"}'::jsonb;
  if found then raise exception 'LEAK: a session wrote ai_proposals directly'; end if;
end $$;
reset role;

-- ── V2 4F: notifications behind the recipient wall ───────────────────
-- Your inbox is yours: the read policy admits only the owner of the
-- recipient membership. A teammate reads zero of your rows; so does
-- the practice OWNER for a client member's rows (the wall cuts both
-- ways). The one session write is read_at on your own rows (column
-- grant); no session inserts or deletes anything. Prefs are one row
-- per person, theirs alone.

insert into notifications (practice_id, client_id, engagement_id,
                           recipient_client_member_id, kind, title, href)
  select '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
         '30000000-0000-0000-0000-0000000000a1', id, 'homework_feedback',
         'leak-test notification (member)', '/homework'
  from client_members where email = 'member_a1@client-a.test';
insert into notifications (practice_id, recipient_practice_member_id, kind, title, href)
  select '10000000-0000-0000-0000-00000000000a', id, 'homework_submitted',
         'leak-test notification (owner)', '/today'
  from practice_members where email = 'owner_a@practice-a.test';

set role authenticated;

-- The recipient: reads their row, marks it read, and nothing else.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"member_a1@client-a.test"}', false);
do $$ begin
  if (select count(*) from notifications) <> 1 then
    raise exception 'member_a1 must read exactly their own notification';
  end if;
  update notifications set read_at = now() where read_at is null;
  if not found then raise exception 'the recipient must be able to mark their row read'; end if;
end $$;
do $$ begin
  update notifications set title = 'defaced';
  raise exception 'HOLE: a session rewrote a notification title';
exception when insufficient_privilege then null; -- the column grant held
end $$;
do $$ begin
  insert into notifications (practice_id, client_id,
                             recipient_client_member_id, kind, title, href)
    select '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-0000000000a1',
           id, 'message_reply', 'forged', '/messages'
    from client_members where email = 'member_a1@client-a.test';
  raise exception 'HOLE: a session inserted a notification';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;
do $$
declare n int;
begin
  delete from notifications;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'HOLE: a session deleted a notification'; end if;
end $$;
-- Prefs: your own row lands; a forged row for the teammate is denied.
do $$ begin
  insert into notification_prefs (practice_id, client_member_id, email_mode)
    select '10000000-0000-0000-0000-00000000000a', id, 'off'
    from client_members where email = 'member_a1@client-a.test';
end $$;
do $$ begin
  insert into notification_prefs (practice_id, client_member_id, email_mode)
    select '10000000-0000-0000-0000-00000000000a', id, 'off'
    from client_members where email = 'member_a1c@client-a.test';
  raise exception 'LEAK: a member set a teammate''s notification pref';
exception when insufficient_privilege then null; -- expected RLS denial
end $$;

-- The teammate and the buyer persona: zero rows of yours.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","email":"member_a1c@client-a.test"}', false);
do $$ begin
  if (select count(*) from notifications) <> 0 then
    raise exception 'LEAK 4F: a teammate reads another member''s notifications';
  end if;
  if (select count(*) from notification_prefs) <> 0 then
    raise exception 'LEAK 4F: a teammate reads another member''s prefs';
  end if;
end $$;

-- The practice owner: their OWN row only; the member's row is walled.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner_a@practice-a.test"}', false);
do $$ begin
  if (select count(*) from notifications) <> 1 then
    raise exception 'LEAK 4F: the recipient wall must cut both ways (owner reads only their own row)';
  end if;
end $$;

-- Cross-client and cross-practice: zero.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"member_a2@client-a2.test"}', false);
do $$ begin
  if (select count(*) from notifications) <> 0 then
    raise exception 'LEAK cross-client: member_a2 reads client_a1 notifications';
  end if;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","email":"owner_b@practice-b.test"}', false);
do $$ begin
  if (select count(*) from notifications) <> 0 then
    raise exception 'LEAK cross-practice: owner_b reads practice_a notifications';
  end if;
end $$;

reset role;

select 'keystone isolation matrix: all assertions passed' as result;
