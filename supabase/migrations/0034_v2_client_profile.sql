-- V2 client profile (specs/keystone-v2-client-profiles.md), gate CP-3.
--
-- The org-level facts a profile is for, held on a PRACTICE-ONLY table
-- rather than as columns on clients. The reason is the 1B precedent
-- (engagement_drafts): clients_read admits the client's OWN member
-- (is_member_of_client), and RLS is row-level, so a private practice
-- note added to the clients row would be readable by that client
-- member straight from the REST endpoint even though no client-surface
-- code selects it. The wall must be RLS, not app-code omission (the
-- pure-RLS client surface is the highest-risk surface). So the facts
-- live on their own table whose read policy is is_practice_member
-- ALONE: a client session sees nothing here, by construction, the
-- readiness_markers discipline.
--
--   relationship_note        the practice's one-line why-this-client
--   primary_contact_member_id who to reach first, into the roster
--   website                  the org on the web
--   relationship_started_on  the relationship's start, distinct from
--                            the clients row created_at because a
--                            client may predate their Keystone record
--
-- No money enters here: the profile shows the engagement's own
-- fee_display (gate CP-2), never a stored total. Cross-venture revenue
-- stays a Trellis question.

create table if not exists public.client_profiles (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique references public.clients(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  relationship_note text,
  primary_contact_member_id uuid references public.client_members(id) on delete set null,
  website text,
  relationship_started_on date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists client_profiles_practice_idx
  on public.client_profiles (practice_id);
create index if not exists client_profiles_contact_idx
  on public.client_profiles (primary_contact_member_id);

alter table public.client_profiles enable row level security;

-- Practice-only, both directions. A practice member reads the record
-- (a consultant to know the client, an owner to edit it); only an owner
-- writes (practice.manage). A client session matches no policy and so
-- reads and writes nothing: the profile is the practice's own record
-- about the client, never client-visible.
create policy client_profiles_read on public.client_profiles
  for select to authenticated
  using (private.is_practice_member(practice_id));
create policy client_profiles_write on public.client_profiles
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'practice.manage'));
create policy client_profiles_update on public.client_profiles
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'practice.manage'))
  with check (private.keystone_can(practice_id, null, 'practice.manage'));
