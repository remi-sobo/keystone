-- V2 1B: the Engagement Builder's draft table
-- (specs/keystone-v2-engagement-builder.md).
--
-- A draft is NOT an engagement yet. It lives practice-only with a
-- loose jsonb shape, and publishing births the real rows. Chosen over
-- a status flag on engagements because 'proposed' is already
-- client-visible and bookable on the client surface: a draft flag
-- would need a filter in every client policy and query, and one miss
-- is a leak. This table has ZERO client-facing policies, so a draft
-- cannot leak by construction; the isolation matrix proves it,
-- including the same-client case.
--
-- client_id here is the draft's TARGET, never a read grant: no policy
-- consults it. Discard is a status; there is no delete policy.

create table if not exists public.engagement_drafts (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  -- Nullable: the client can be picked mid-draft.
  client_id   uuid references public.clients(id) on delete set null,
  title       text not null default 'Untitled engagement',
  -- starts_on, length_months, fee_display, cadence_md, workstreams,
  -- invites, notes_md. Validated loosely on save, fully at publish.
  shape       jsonb not null default '{}',
  status      text not null default 'draft'
              check (status in ('draft','published','discarded')),
  published_engagement_id uuid references public.engagements(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists engagement_drafts_practice_idx
  on public.engagement_drafts (practice_id, status, updated_at desc);

alter table public.engagement_drafts enable row level security;

-- Practice members read; engagement.write (owner and consultant) may
-- create and update. The hardened predicates from 0009 mean a revoked
-- member loses drafts with everything else. No delete policy: discard
-- is a status flip through the update policy.
create policy engagement_drafts_read on public.engagement_drafts
  for select to authenticated
  using (private.is_practice_member(practice_id));
create policy engagement_drafts_insert on public.engagement_drafts
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
create policy engagement_drafts_update on public.engagement_drafts
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'engagement.write'))
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
