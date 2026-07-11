-- V2 4G: pipeline-lite (specs/keystone-v2-pipeline.md).
--
-- Product-tier, per CONFIRM V2-5 (decided 2026-07-09): a future coach
-- who buys Keystone has no Trellis, so the light pre-engagement
-- pipeline exists for them, behind a practice-level flag that SOBO
-- LEAVES OFF. Trellis stays the business brain; this table carries NO
-- money columns on purpose (no fee, no amount, no value), so it can
-- never become a second place to track SOBO's money. Person-data is
-- minimized to a contact name and email, nothing else.
--
-- Practice-only, the engagement_drafts discipline: no client_id
-- (there is no client yet; that is the point), practice members read,
-- engagement.write writes, no delete policy (closed is a stage, not
-- an erasure). Conversion links to the builder: a won deal becomes an
-- engagement draft and the deal keeps the receipt.

alter table public.practices
  add column if not exists pipeline_enabled boolean not null default false;

create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  practice_id         uuid not null references public.practices(id) on delete cascade,
  name                text not null,
  contact_name        text,
  contact_email       text,
  note_md             text,
  stage               text not null default 'lead'
                      check (stage in ('lead','discovery','proposal','verbal_yes','paused','closed','converted')),
  engagement_draft_id uuid references public.engagement_drafts(id) on delete set null,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists deals_practice_idx on public.deals (practice_id, stage);

alter table public.deals enable row level security;

create policy deals_read on public.deals
  for select to authenticated
  using (private.is_practice_member(practice_id));
create policy deals_insert on public.deals
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
create policy deals_update on public.deals
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'engagement.write'))
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
-- No delete policy: closed is a stage, not an erasure.
