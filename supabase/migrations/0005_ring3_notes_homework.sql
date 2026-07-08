-- Ring 3: session notes, AI proposals, homework, readiness
-- (specs/keystone.md sections 4, 5.1, 5.2; plan in
-- docs/keystone-ring3-plan.md).
--
-- The AI contract lands here structurally: ai_proposals has NO
-- insert/update policies for sessions, so even a consultant's own
-- session key cannot create or accept a proposal through REST. The
-- extraction route (service role, after the membership check) is the
-- only writer, and the accept route is the only path into live tables.

-- ---------------------------------------------------------------------
-- session_notes
-- ---------------------------------------------------------------------

create table if not exists public.session_notes (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade unique,
  engagement_id   uuid not null references public.engagements(id) on delete cascade,
  practice_id     uuid not null references public.practices(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  -- The transcript lives in-row up to the paste cap; transcript_path is
  -- the storage pointer for the long-transcript offload (SECURITY.md 4).
  raw_transcript  text,
  transcript_path text,
  summary_md      text,
  decisions_md    text,
  -- 'practice' until the consultant accepts a proposal, which publishes
  -- the record to the client ('shared').
  visibility      text not null default 'practice' check (visibility in ('practice','shared')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists session_notes_engagement_idx on public.session_notes (engagement_id);

-- ---------------------------------------------------------------------
-- action_items (the work spine: action items and homework, one table)
-- ---------------------------------------------------------------------

create table if not exists public.action_items (
  id                        uuid primary key default gen_random_uuid(),
  engagement_id             uuid not null references public.engagements(id) on delete cascade,
  practice_id               uuid not null references public.practices(id) on delete cascade,
  client_id                 uuid not null references public.clients(id) on delete cascade,
  workstream_id             uuid references public.workstreams(id) on delete set null,
  session_id                uuid references public.sessions(id) on delete set null,
  title                     text not null,
  -- Assigned to exactly one person, on either side of the table.
  assigned_client_member_id uuid references public.client_members(id) on delete set null,
  assigned_practice_member_id uuid references public.practice_members(id) on delete set null,
  due_on                    date,
  timing                    text not null default 'standing'
                            check (timing in ('before_session','after_session','standing')),
  status                    text not null default 'open' check (status in ('open','done')),
  done_at                   timestamptz,
  source                    text not null default 'manual'
                            check (source in ('manual','accepted_proposal')),
  proposal_id               uuid,
  created_at                timestamptz not null default now()
);
create index if not exists action_items_engagement_idx on public.action_items (engagement_id, status);
create index if not exists action_items_assignee_idx
  on public.action_items (assigned_client_member_id, status);

-- ---------------------------------------------------------------------
-- ai_proposals (every AI write lands here, never a live table)
-- ---------------------------------------------------------------------

create table if not exists public.ai_proposals (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('extraction','digest','suggestion')),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  session_id    uuid references public.sessions(id) on delete cascade,
  payload       jsonb not null,
  status        text not null default 'proposed'
                check (status in ('proposed','accepted','dismissed')),
  model_used    text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null
);
create index if not exists ai_proposals_queue_idx
  on public.ai_proposals (practice_id, status, created_at desc);

-- ---------------------------------------------------------------------
-- readiness_markers (the consultant's lens; prose, never a score)
-- ---------------------------------------------------------------------

create table if not exists public.readiness_markers (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  pillar        text not null check (pillar in ('philosophy','system','execution')),
  note_md       text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null,
  unique (engagement_id, pillar)
);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Does the caller own this client membership row? The client check-off
-- policy keys on it: a client member updates ONLY items assigned to
-- their own membership.
create or replace function private.owns_client_membership(p_member uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members
    where id = p_member and user_id = auth.uid()
  );
$$;
revoke all on function private.owns_client_membership(uuid) from public, anon;
grant execute on function private.owns_client_membership(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.session_notes enable row level security;
alter table public.action_items enable row level security;
alter table public.ai_proposals enable row level security;
alter table public.readiness_markers enable row level security;

-- session_notes: the practice reads everything; a client member reads
-- only their own client's SHARED notes (the accepted record, spec
-- section 4). The transcript rides the row, so an unshared note (and
-- its transcript) never reaches a client session.
create policy session_notes_read on public.session_notes
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or (visibility = 'shared' and private.is_member_of_client(client_id))
  );
create policy session_notes_write on public.session_notes
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy session_notes_update on public.session_notes
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));

-- action_items: everything in the engagement is visible to all four
-- client members (spec section 3); writes are consultant-side, except
-- the one client write: checking off an item assigned to you.
create policy action_items_read on public.action_items
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy action_items_write on public.action_items
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy action_items_update on public.action_items
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy action_items_checkoff on public.action_items
  for update to authenticated
  using (private.owns_client_membership(assigned_client_member_id))
  with check (private.owns_client_membership(assigned_client_member_id));
create policy action_items_delete on public.action_items
  for delete to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'));

-- ai_proposals: practice members READ the queue; nobody writes through
-- a session. The extraction route (service role after the check) is the
-- only writer; the accept route is the only decider. A client member
-- never sees a proposal at all.
create policy ai_proposals_read on public.ai_proposals
  for select to authenticated
  using (private.is_practice_member(practice_id));

-- readiness_markers: consultant-only in both directions (CONFIRM 12
-- default). No client-member path at all; facts beside judgment, and
-- the judgment stays in the workshop until deliberately shared.
create policy readiness_read on public.readiness_markers
  for select to authenticated
  using (private.is_practice_member(practice_id));
create policy readiness_write on public.readiness_markers
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy readiness_update on public.readiness_markers
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
