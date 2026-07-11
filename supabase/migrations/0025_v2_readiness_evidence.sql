-- V2 4D: readiness evidence (specs/keystone-v2-readiness.md).
--
-- The consultant's three-pillar judgments get receipts: links to real
-- artifacts (a session, a homework item, a decision, a deliverable).
-- The read policy is the LENS WALL: practice-only, the
-- engagement_drafts discipline, because a receipt for a judgment the
-- client cannot see is itself part of the judgment. Sharing happens
-- through a composed reflection into the message thread, on purpose,
-- never through this table. Links are removable (a wrong link was a
-- mistake, not history); there is no update policy (the
-- outcome_evidence precedent: removed, never edited); the artifact is
-- never touched.

create table if not exists public.readiness_evidence (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  pillar        text not null check (pillar in ('philosophy','system','execution')),
  kind          text not null check (kind in ('session','action_item','decision','deliverable')),
  ref_id        uuid not null,
  note          text,
  added_by      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists readiness_evidence_engagement_idx
  on public.readiness_evidence (engagement_id, pillar);

alter table public.readiness_evidence enable row level security;

-- The lens wall: practice members only, both dimensions carried for
-- the matrix but the client NEVER reads, same as readiness_markers.
create policy readiness_evidence_read on public.readiness_evidence
  for select to authenticated
  using (private.is_practice_member(practice_id));
create policy readiness_evidence_insert on public.readiness_evidence
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy readiness_evidence_delete on public.readiness_evidence
  for delete to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'));
-- No update policy: a wrong link is removed, never edited.
