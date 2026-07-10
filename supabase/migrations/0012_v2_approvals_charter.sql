-- V2 5D + 2A: the Approvals primitive and the Engagement Charter
-- (specs/keystone-v2-approvals.md, specs/keystone-v2-charter.md).
--
-- approvals: a durable, audited record of who agreed to what, when.
-- Immutable once decided (no update path exists for a decided row, no
-- delete policy at all). The client's decide action is an RLS-governed
-- update through their own session, column-granted to status and
-- note_md only; the decider's identity is stamped by trigger from the
-- verified JWT, so it can never be spoofed by a crafted request.
--
-- engagement_charters: the versioned constitution. Drafts are invisible
-- to client members BY POLICY inside the one table (versions must live
-- together to version cleanly); published and superseded bodies are
-- immutable to every session, because the status transition rides the
-- publish action through the service role after the check, keeping the
-- one-live-version rule (partial unique index) atomic.

-- ---------------------------------------------------------------------
-- approvals (5D)
-- ---------------------------------------------------------------------

create table if not exists public.approvals (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  subject_type  text not null check (subject_type in
                  ('charter','deliverable','stage','closeout','case_study','document')),
  subject_id    uuid not null,
  subject_label text not null,
  requested_by  uuid references auth.users(id) on delete set null,
  requested_at  timestamptz not null default now(),
  status        text not null default 'pending'
                check (status in ('pending','approved','not_yet','withdrawn')),
  decided_at        timestamptz,
  decided_by        uuid references auth.users(id) on delete set null,
  decided_by_email  text,
  note_md           text,
  created_at    timestamptz not null default now()
);
create index if not exists approvals_engagement_idx
  on public.approvals (engagement_id, status, requested_at desc);
create index if not exists approvals_subject_idx
  on public.approvals (subject_type, subject_id);

alter table public.approvals enable row level security;

-- The decider's identity comes from the session, never from the
-- payload: a decision stamps auth.uid() and the verified JWT email.
create or replace function private.approvals_stamp_decider()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('approved','not_yet') then
    new.decided_at := now();
    new.decided_by := auth.uid();
    new.decided_by_email := nullif(auth.jwt() ->> 'email', '');
  end if;
  return new;
end;
$$;
drop trigger if exists approvals_stamp_decider on public.approvals;
create trigger approvals_stamp_decider
  before update on public.approvals
  for each row execute function private.approvals_stamp_decider();

-- Read: both walls. The client must see what awaits them.
create policy approvals_read on public.approvals
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
-- Requests come from the practice only.
create policy approvals_insert on public.approvals
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
-- Two narrow update paths on PENDING rows and nothing else:
-- a client member of that client decides; the practice withdraws.
create policy approvals_client_decide on public.approvals
  for update to authenticated
  using (status = 'pending' and private.is_member_of_client(client_id))
  with check (
    status in ('approved','not_yet')
    and private.is_member_of_client(client_id)
  );
create policy approvals_practice_withdraw on public.approvals
  for update to authenticated
  using (status = 'pending' and private.is_practice_member(practice_id))
  with check (status = 'withdrawn' and private.is_practice_member(practice_id));
-- No delete policy: the record of assent is permanent.

-- Sessions may touch only the decision fields the policies govern; the
-- trigger owns identity (0007 read_at pattern, narrowed further).
revoke update on public.approvals from authenticated;
grant update (status, note_md) on public.approvals to authenticated;

-- ---------------------------------------------------------------------
-- engagement_charters (2A)
-- ---------------------------------------------------------------------

create table if not exists public.engagement_charters (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  version       int not null,
  body_md       text not null,
  status        text not null default 'draft'
                check (status in ('draft','published','superseded')),
  published_at  timestamptz,
  published_by  uuid references auth.users(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (engagement_id, version)
);
-- The one-live-version law, held by the database.
create unique index if not exists engagement_charters_one_published
  on public.engagement_charters (engagement_id) where (status = 'published');
create index if not exists engagement_charters_engagement_idx
  on public.engagement_charters (engagement_id, version desc);

alter table public.engagement_charters enable row level security;

-- The practice reads every version. A client member reads published
-- and superseded versions of their own client's engagement; drafts are
-- invisible by policy.
create policy engagement_charters_read on public.engagement_charters
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or (status <> 'draft' and private.is_member_of_client(client_id))
  );
create policy engagement_charters_insert on public.engagement_charters
  for insert to authenticated
  with check (
    status = 'draft'
    and private.keystone_can(practice_id, null, 'engagement.write')
  );
-- Sessions edit DRAFTS only, and a draft stays a draft: the publish
-- transition (draft -> published, previous -> superseded) rides the
-- service role after the membership check, so published bodies are
-- immutable to every session.
create policy engagement_charters_update on public.engagement_charters
  for update to authenticated
  using (status = 'draft' and private.keystone_can(practice_id, null, 'engagement.write'))
  with check (status = 'draft' and private.keystone_can(practice_id, null, 'engagement.write'));
-- No delete policy: versions are append-only history.
