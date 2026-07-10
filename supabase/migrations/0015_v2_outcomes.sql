-- V2 2C: outcomes and success measures (specs/keystone-v2-outcomes.md).
--
-- The engagement's own success measures, derived from the charter's
-- success section: baseline, target, a dated standing note in prose,
-- reached_on rendered as history, and EVIDENCE as links to real
-- artifacts (deliverable, session, action item, decision), never a
-- self-reported number. No aggregate progress display exists anywhere
-- (gate 2C-2); nothing here scores a person or an organization.
--
-- outcomes: practice writes, both sides read, no session delete
-- (retiring an outcome is a charter conversation, then a new charter
-- version, never a quiet row removal). outcome_evidence: links, so
-- the practice may remove a mistaken one; the artifact is untouched.

create table if not exists public.outcomes (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  workstream_id uuid references public.workstreams(id) on delete set null,
  title         text not null,
  baseline_md   text,
  target_md     text,
  standing_md   text,
  standing_updated_at timestamptz,
  reached_on    date,
  sort          int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists outcomes_engagement_idx
  on public.outcomes (engagement_id, sort);

create table if not exists public.outcome_evidence (
  id            uuid primary key default gen_random_uuid(),
  outcome_id    uuid not null references public.outcomes(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  kind          text not null check (kind in ('deliverable','session','action_item','decision')),
  ref_id        uuid not null,
  note          text,
  added_by      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists outcome_evidence_outcome_idx
  on public.outcome_evidence (outcome_id);

alter table public.outcomes enable row level security;
alter table public.outcome_evidence enable row level security;

create policy outcomes_read on public.outcomes
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy outcomes_insert on public.outcomes
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
create policy outcomes_update on public.outcomes
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'engagement.write'))
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
-- No delete policy on outcomes.

create policy outcome_evidence_read on public.outcome_evidence
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy outcome_evidence_insert on public.outcome_evidence
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
create policy outcome_evidence_delete on public.outcome_evidence
  for delete to authenticated
  using (private.keystone_can(practice_id, null, 'engagement.write'));
-- No update policy on evidence: a wrong link is removed, never edited.
