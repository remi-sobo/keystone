-- V2 5A: the closeout room (specs/keystone-v2-closeout.md).
--
-- The formal "it stands without us" moment. One row per engagement
-- holding ONLY the six consultant-authored sections; final outcomes,
-- deliverables, the charter, and the last digest are read from the
-- record at render, never copied, because a copy drifts and the
-- room's honesty is the live ledger. The charter discipline: drafts
-- are invisible to the client, publish is the deliberate moment, and
-- the sign-off rides the 5D approvals primitive (subject_type
-- 'closeout', legal since 0012). No delete policy: a closeout is the
-- record of an ending.

create table if not exists public.closeouts (
  id             uuid primary key default gen_random_uuid(),
  engagement_id  uuid not null unique references public.engagements(id) on delete cascade,
  practice_id    uuid not null references public.practices(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  risks_md       text,
  ownership_md   text,
  maintenance_md text,
  training_md    text,
  breaks_md      text,
  next_md        text,
  status         text not null default 'draft' check (status in ('draft','published')),
  published_at   timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists closeouts_practice_idx on public.closeouts (practice_id);

alter table public.closeouts enable row level security;

-- The charter pattern: the practice reads its own in any status; a
-- client member reads PUBLISHED rows of their own client only.
create policy closeouts_read on public.closeouts
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or (status = 'published' and private.is_member_of_client(client_id))
  );
create policy closeouts_insert on public.closeouts
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy closeouts_update on public.closeouts
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
-- No delete policy: you do not un-ring the bell.

-- 4F grows one kind: the room opening to the client team.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in
        ('homework_submitted','homework_feedback','homework_due','homework_overdue',
         'poll_opened','poll_booked','deliverable_shipped','approval_waiting','message_reply',
         'session_reminder','approval_decided','closeout_published'));
