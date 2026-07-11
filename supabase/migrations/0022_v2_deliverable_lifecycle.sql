-- V2 3D: the deliverable lifecycle (specs/keystone-v2-deliverables.md).
--
-- A deliverable grows from an artifact into a handoff: About prose and
-- a session link on the row, an append-only version history for FILE
-- deliverables (links edit, never version; the outgoing object is kept
-- and recorded before the pointer moves), and deliberate acceptance
-- riding the 5D approvals machinery UNCHANGED: subject_type
-- 'deliverable' has been legal since 0012, so the decided-once
-- trigger, the JWT-stamped identity, and the humane not_yet decline
-- all come free. Viewed-by tracking does not exist and never will
-- (gate 3D-5, the V2 spec's own humane-data rule).

alter table public.deliverables
  add column if not exists about_md text,
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

create table if not exists public.deliverable_versions (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  engagement_id  uuid not null references public.engagements(id) on delete cascade,
  practice_id    uuid not null references public.practices(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  version        int not null,
  storage_path   text not null,
  replaced_at    timestamptz not null default now(),
  replaced_by    uuid references auth.users(id) on delete set null,
  unique (deliverable_id, version)
);
create index if not exists deliverable_versions_deliverable_idx
  on public.deliverable_versions (deliverable_id, version desc);

alter table public.deliverable_versions enable row level security;

-- The history of what shipped is part of the record: both sides read.
create policy deliverable_versions_read on public.deliverable_versions
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
-- The replace action records the outgoing version; consultants only.
create policy deliverable_versions_insert on public.deliverable_versions
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
-- NO update policy. NO delete policy. History is history.

-- 4F grows one kind: the acceptance decision coming back to the
-- practice (the request already rides approval_waiting).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in
        ('homework_submitted','homework_feedback','homework_due','homework_overdue',
         'poll_opened','poll_booked','deliverable_shipped','approval_waiting','message_reply',
         'session_reminder','approval_decided'));
