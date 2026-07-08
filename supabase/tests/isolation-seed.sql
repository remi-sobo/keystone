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
--   member_a2@client-a2.test       client_member of client_a2 (practice_a)
--   member_b@client-b.test         client_member of client_b (practice_b)
--   stranger@example.test          valid session, NO membership
--   anon                           no session at all

-- ── Setup: auth users ────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner_a@practice-a.test'),
  ('00000000-0000-0000-0000-00000000000b', 'consultant_a@practice-a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'member_a1@client-a.test'),
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
  ('60000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1',
   '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000b1',
   'client_b homework',
   (select id from client_members where email = 'member_b@client-b.test'), 'open');

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
  if (select count(*) from client_members where user_id is not null) <> 3 then
    raise exception 'claim did not link exactly the three client members';
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
  if (select count(*) from action_items) <> 2 then raise exception 'owner_a item visibility wrong'; end if;
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
  if (select count(*) from action_items) <> 2 then
    raise exception 'member_a1 must see both of their client''s items';
  end if;
  if (select count(*) from action_items where client_id <> '20000000-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'LEAK cross-client: member_a1 reads another client''s items';
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

select 'keystone isolation matrix: all assertions passed' as result;
