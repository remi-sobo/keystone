-- Ring 6: the weekly digest (specs/keystone.md sections 4 and 5.1).
--
-- The digest is drafted by AI from what actually happened (sessions
-- held, deliverables shipped, homework done, stage changes) plus what
-- is scheduled next; the draft lands in ai_proposals (kind 'digest',
-- inert like every AI write), the consultant approves it on the Monday
-- screen, and only THEN does a digests row exist and an email go out.
-- An empty week is refused in code before any model call.
--
-- digests is the record of approved-and-sent digests, not a work
-- queue: readable by the practice, written by NO session (the approve
-- action writes it through the service role after the membership
-- check, the same single-accept-path shape as Ring 3). Clients meet
-- the digest in their inbox, not in-app, so there is no client read.

create table if not exists public.digests (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  -- The Monday of the week the digest reports on.
  week_of       date not null,
  subject       text not null,
  draft_md      text not null,
  status        text not null default 'approved'
                check (status in ('approved','sent')),
  proposal_id   uuid,
  approved_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz not null default now(),
  sent_at       timestamptz,
  unique (engagement_id, week_of)
);
create index if not exists digests_practice_idx
  on public.digests (practice_id, week_of desc);

alter table public.digests enable row level security;

-- Practice-only read; no client read (the client's copy is the email);
-- no session write of any kind: the single accept path writes through
-- the service role after the membership check.
create policy digests_read on public.digests
  for select to authenticated
  using (private.is_practice_member(practice_id));
