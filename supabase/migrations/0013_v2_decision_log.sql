-- V2 2B: the Decision Log (specs/keystone-v2-decision-log.md).
--
-- Decisions as first-class rows, and the strongest immutability in
-- the schema: ZERO update policies and ZERO delete policies. After
-- insert, no session can touch a row. A course change is a NEW
-- decision carrying `supersedes` back to the old one, so even
-- supersession mutates nothing; the read side renders the chain.
--
-- The log is the engagement record: client-visible by design (the
-- section 12 wall gates what may become a decision at all, not who
-- reads it). 3A lands its accepted-proposal wiring on the columns
-- below without another migration.

create table if not exists public.decisions (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  workstream_id uuid references public.workstreams(id) on delete set null,
  session_id    uuid references public.sessions(id) on delete set null,
  decided_on    date not null,
  title         text not null,
  context_md    text,
  -- Free prose: decisions are often joint and sometimes belong to
  -- people who never log in. The audit log records which user LOGGED
  -- the row.
  decided_by_label text,
  revisit_on    date,
  supersedes    uuid references public.decisions(id) on delete set null,
  source        text not null default 'manual'
                check (source in ('manual','accepted_proposal')),
  proposal_id   uuid,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists decisions_engagement_idx
  on public.decisions (engagement_id, decided_on desc, created_at desc);
create index if not exists decisions_supersedes_idx
  on public.decisions (supersedes);

alter table public.decisions enable row level security;

-- Read: both walls. Insert: the practice logs. Nothing else exists.
create policy decisions_read on public.decisions
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy decisions_insert on public.decisions
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
-- No update policy. No delete policy. Logged means logged.
