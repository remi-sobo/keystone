-- Throwaway test-tenant seed (the weekend isolation runbook, part A).
--
-- Creates a SEPARATE practice from SOBO so cross-tenant probing never
-- happens against a tenant holding anything real:
--   practice  zzz-test TestPractice (slug zzz-test-practice)
--   clients   TestCo, DemoOrg (one engagement + one canary roadmap row each)
--   users     remisobo+testco / +demoorg (client members, admin-created
--             passwords), remisobo+testadmin (practice owner)
--
-- Teardown marker: the practice row (name prefix zzz-test, slug
-- zzz-test-practice) plus the fixed eeee0000-* uuids below; every other
-- row cascades from the practice via practice_id. The three auth users
-- are the only rows outside the cascade; scripts/teardown-test.ts
-- deletes them by their remisobo+*@gmail.com emails.
--
-- Idempotent: fixed uuids, on conflict do nothing everywhere. A re-run
-- inserts zero rows and never resets a password.
--
-- The __PLACEHOLDER__ markers (three passwords, two canary suffixes)
-- are substituted at apply time; secrets never live in this file.
-- Applied to the live project via the Supabase admin channel; runnable
-- with psql after substitution:
--   sed -e "s/__TESTCO_PASSWORD__/.../" ... scripts/seed-test-tenant.sql | psql "$DATABASE_URL"

begin;

-- 1. The throwaway practice (the teardown anchor)
insert into public.practices (id, name, slug) values
  ('eeee0000-0000-4000-a000-000000000001', 'zzz-test TestPractice', 'zzz-test-practice')
on conflict do nothing;

-- 2. Two clients under it
insert into public.clients (id, practice_id, name) values
  ('eeee0000-0000-4000-a000-000000000011', 'eeee0000-0000-4000-a000-000000000001', 'TestCo'),
  ('eeee0000-0000-4000-a000-000000000012', 'eeee0000-0000-4000-a000-000000000001', 'DemoOrg')
on conflict do nothing;

-- 3. One engagement each
insert into public.engagements (id, practice_id, client_id, title, status) values
  ('eeee0000-0000-4000-a000-000000000021', 'eeee0000-0000-4000-a000-000000000001',
   'eeee0000-0000-4000-a000-000000000011', 'TestCo Build', 'active'),
  ('eeee0000-0000-4000-a000-000000000022', 'eeee0000-0000-4000-a000-000000000001',
   'eeee0000-0000-4000-a000-000000000012', 'DemoOrg Build', 'active')
on conflict do nothing;

-- 4. Canary roadmap rows. engagement_sessions requires a parent phase,
-- so each engagement gets one zzz-test phase and one canary session.
-- The canaries are the proof that an empty cross-tenant read means RLS
-- blocked it, not that the table was empty.
insert into public.engagement_phases
  (id, engagement_id, practice_id, client_id, sort_order, month_label, title) values
  ('eeee0000-0000-4000-a000-000000000031', 'eeee0000-0000-4000-a000-000000000021',
   'eeee0000-0000-4000-a000-000000000001', 'eeee0000-0000-4000-a000-000000000011',
   1, 'Test', 'zzz-test canary phase'),
  ('eeee0000-0000-4000-a000-000000000032', 'eeee0000-0000-4000-a000-000000000022',
   'eeee0000-0000-4000-a000-000000000001', 'eeee0000-0000-4000-a000-000000000012',
   1, 'Test', 'zzz-test canary phase')
on conflict do nothing;

insert into public.engagement_sessions
  (id, engagement_id, phase_id, practice_id, client_id, sort_order, code, title, status) values
  ('eeee0000-0000-4000-a000-000000000041', 'eeee0000-0000-4000-a000-000000000021',
   'eeee0000-0000-4000-a000-000000000031', 'eeee0000-0000-4000-a000-000000000001',
   'eeee0000-0000-4000-a000-000000000011', 1, 'CANARY', 'CANARY-TESTCO-__TESTCO_SUFFIX__', 'upcoming'),
  ('eeee0000-0000-4000-a000-000000000042', 'eeee0000-0000-4000-a000-000000000022',
   'eeee0000-0000-4000-a000-000000000032', 'eeee0000-0000-4000-a000-000000000001',
   'eeee0000-0000-4000-a000-000000000012', 1, 'CANARY', 'CANARY-DEMOORG-__DEMOORG_SUFFIX__', 'upcoming')
on conflict do nothing;

-- 5. The three throwaway auth users, admin-created with temporary
-- passwords so the isolation script can sign in without email. The
-- standard GoTrue password-user shape: bcrypt via pgcrypto, email
-- pre-confirmed, matching identity row.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'eeee0000-0000-4000-a000-0000000000a1',
   'authenticated', 'authenticated', 'remisobo+testco@gmail.com',
   extensions.crypt('__TESTCO_PASSWORD__', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'eeee0000-0000-4000-a000-0000000000a2',
   'authenticated', 'authenticated', 'remisobo+demoorg@gmail.com',
   extensions.crypt('__DEMOORG_PASSWORD__', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'eeee0000-0000-4000-a000-0000000000a3',
   'authenticated', 'authenticated', 'remisobo+testadmin@gmail.com',
   extensions.crypt('__TESTADMIN_PASSWORD__', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict do nothing;

insert into auth.identities
  (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  extensions.gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email,
                     'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from auth.users u
where u.id in ('eeee0000-0000-4000-a000-0000000000a1',
               'eeee0000-0000-4000-a000-0000000000a2',
               'eeee0000-0000-4000-a000-0000000000a3')
on conflict do nothing;

-- 6. Memberships, pre-claimed (user_id set) since these logins are
-- admin-created, not invited; part C exercises the real invite path.
insert into public.client_members
  (id, client_id, practice_id, user_id, email, role, claimed_at) values
  ('eeee0000-0000-4000-a000-000000000051', 'eeee0000-0000-4000-a000-000000000011',
   'eeee0000-0000-4000-a000-000000000001', 'eeee0000-0000-4000-a000-0000000000a1',
   'remisobo+testco@gmail.com', 'client_member', now()),
  ('eeee0000-0000-4000-a000-000000000052', 'eeee0000-0000-4000-a000-000000000012',
   'eeee0000-0000-4000-a000-000000000001', 'eeee0000-0000-4000-a000-0000000000a2',
   'remisobo+demoorg@gmail.com', 'client_member', now())
on conflict do nothing;

insert into public.practice_members
  (id, practice_id, user_id, email, role, claimed_at) values
  ('eeee0000-0000-4000-a000-000000000053', 'eeee0000-0000-4000-a000-000000000001',
   'eeee0000-0000-4000-a000-0000000000a3', 'remisobo+testadmin@gmail.com', 'owner', now())
on conflict do nothing;

-- 7. One PENDING invite row (no auth user, unclaimed) so the email
-- round-trip (runbook part C) is a single Resend-invite click on the
-- TestPractice Members page. Any auth user the click eventually creates
-- matches the remisobo+* teardown pattern.
insert into public.client_members (id, client_id, practice_id, email, role, invited_by)
values ('eeee0000-0000-4000-a000-000000000054', 'eeee0000-0000-4000-a000-000000000011',
        'eeee0000-0000-4000-a000-000000000001', 'remisobo+invite@gmail.com', 'client_member',
        'eeee0000-0000-4000-a000-0000000000a3')
on conflict do nothing;

commit;
