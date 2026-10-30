-- Read AI import, and the transcript moves behind the practice wall
-- (specs/keystone-readai.md).
--
-- Two tables and one hardening step:
--
--   1. session_transcripts: the raw call transcript, one per session,
--      readable by the PRACTICE ONLY. No client-member policy exists at
--      all, so no client session can read a transcript by any query.
--   2. The hardening: transcripts used to ride session_notes, whose read
--      policy admits every client member once a note is shared, and the
--      client session page rendered them. Every existing transcript is
--      copied across, the session_notes column is emptied, and a check
--      constraint keeps it empty, so a stale deploy that still writes
--      the old column fails loudly instead of publishing a transcript.
--   3. readai_meetings: the Read AI intake ledger. One row per Read AI
--      meeting that reached the webhook. Practice-read only, written by
--      the service role alone (the webhook after its secret check, and
--      the practice actions after the membership check). A meeting that
--      matches no client keeps NO content, only the fact that it came in.

-- ---------------------------------------------------------------------
-- session_transcripts
-- ---------------------------------------------------------------------

create table if not exists public.session_transcripts (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id) on delete cascade unique,
  engagement_id     uuid not null references public.engagements(id) on delete cascade,
  practice_id       uuid not null references public.practices(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  body              text not null,
  source            text not null default 'paste' check (source in ('paste','readai')),
  -- Set when the transcript arrived through Read AI (no FK: the ledger
  -- row may be discarded later; the transcript stays with the session).
  readai_meeting_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists session_transcripts_engagement_idx
  on public.session_transcripts (engagement_id);

alter table public.session_transcripts enable row level security;

-- Practice members read; consultants write. There is deliberately no
-- client-member branch in any policy on this table.
drop policy if exists session_transcripts_read on public.session_transcripts;
create policy session_transcripts_read on public.session_transcripts
  for select to authenticated
  using (private.is_practice_member(practice_id));
drop policy if exists session_transcripts_write on public.session_transcripts;
create policy session_transcripts_write on public.session_transcripts
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
drop policy if exists session_transcripts_update on public.session_transcripts;
create policy session_transcripts_update on public.session_transcripts
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
drop policy if exists session_transcripts_delete on public.session_transcripts;
create policy session_transcripts_delete on public.session_transcripts
  for delete to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'));

-- Move every existing transcript across, then empty the old column.
insert into public.session_transcripts
  (session_id, engagement_id, practice_id, client_id, body, source, created_at, updated_at)
select n.session_id, n.engagement_id, n.practice_id, n.client_id, n.raw_transcript, 'paste',
       n.created_at, n.updated_at
from public.session_notes n
where n.raw_transcript is not null and length(n.raw_transcript) > 0
on conflict (session_id) do nothing;

update public.session_notes set raw_transcript = null where raw_transcript is not null;

do $$ begin
  alter table public.session_notes
    add constraint session_notes_no_inline_transcript check (raw_transcript is null);
exception when duplicate_object then null;
end $$;

comment on column public.session_notes.raw_transcript is
  'Retired by 0050. Always null; transcripts live in session_transcripts (practice only).';

-- ---------------------------------------------------------------------
-- readai_meetings (the intake ledger)
-- ---------------------------------------------------------------------

create table if not exists public.readai_meetings (
  id                uuid primary key default gen_random_uuid(),
  practice_id       uuid not null references public.practices(id) on delete cascade,
  -- Read AI's own meeting id (the webhook's session_id). Unique per
  -- practice, so a replayed webhook never imports twice.
  readai_id         text not null,
  -- 'attached'      matched to a session; transcript and proposal made
  -- 'needs_review'  likely a client call, but the match was not certain
  -- 'skipped'       no client signal at all; no content is kept
  -- 'discarded'     a consultant threw it away; content wiped
  status            text not null check (status in ('attached','needs_review','skipped','discarded')),
  match_reason      text not null,
  client_id         uuid references public.clients(id) on delete set null,
  engagement_id     uuid references public.engagements(id) on delete set null,
  session_id        uuid references public.sessions(id) on delete set null,
  proposal_id       uuid references public.ai_proposals(id) on delete set null,
  started_at        timestamptz,
  ended_at          timestamptz,
  -- Content, held only while a meeting waits for review. Attaching moves
  -- the transcript to session_transcripts and the notes into an inert
  -- proposal, then clears these; discarding clears them too.
  title             text,
  report_url        text,
  participant_emails text[] not null default '{}',
  summary_md        text,
  action_items      jsonb,
  transcript_text   text,
  received_at       timestamptz not null default now(),
  decided_at        timestamptz,
  decided_by        uuid references auth.users(id) on delete set null,
  unique (practice_id, readai_id),
  -- Skipped and discarded rows carry no meeting content, by construction.
  constraint readai_meetings_no_content_unless_review check (
    status in ('attached','needs_review')
    or (title is null and summary_md is null and action_items is null
        and transcript_text is null and report_url is null
        and participant_emails = '{}')
  ),
  -- Only a waiting row may hold the transcript or the raw notes.
  constraint readai_meetings_content_only_while_waiting check (
    status = 'needs_review'
    or (summary_md is null and action_items is null and transcript_text is null)
  )
);
create index if not exists readai_meetings_queue_idx
  on public.readai_meetings (practice_id, status, received_at desc);

alter table public.readai_meetings enable row level security;

-- Practice members read the ledger. No session writes: the webhook and
-- the practice actions write through the service role after their own
-- checks, the ai_proposals precedent. A client member never sees a row.
drop policy if exists readai_meetings_read on public.readai_meetings;
create policy readai_meetings_read on public.readai_meetings
  for select to authenticated
  using (private.is_practice_member(practice_id));
