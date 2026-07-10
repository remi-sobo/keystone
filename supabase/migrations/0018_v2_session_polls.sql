-- V2 3H: group scheduling (specs/keystone-v2-group-scheduling.md).
--
-- The date poll on rails the practice already owns. Candidates come
-- from the practice's own offered slots (the Ring 2 engine, reused
-- untouched); client members mark what works, names showing (gate
-- 3H-2); the practice confirms the winner through the existing booking
-- path with its revalidation and exclusion constraint (gate 3H-1).
-- Marks are the one client write: self-authored, retractable while the
-- poll is open, never editable. One open poll per engagement (3H-4).

create table if not exists public.session_polls (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  purpose       text,
  slot_minutes  int not null default 60,
  status        text not null default 'open' check (status in ('open','booked','closed')),
  session_id    uuid references public.sessions(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
-- "The next date" is singular (gate 3H-4).
create unique index if not exists session_polls_one_open
  on public.session_polls (engagement_id) where (status = 'open');

create table if not exists public.session_poll_options (
  id            uuid primary key default gen_random_uuid(),
  poll_id       uuid not null references public.session_polls(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  tz            text not null,
  sort          int not null default 0
);
create index if not exists session_poll_options_poll_idx
  on public.session_poll_options (poll_id, sort);

create table if not exists public.session_poll_marks (
  id               uuid primary key default gen_random_uuid(),
  option_id        uuid not null references public.session_poll_options(id) on delete cascade,
  poll_id          uuid not null references public.session_polls(id) on delete cascade,
  engagement_id    uuid not null references public.engagements(id) on delete cascade,
  practice_id      uuid not null references public.practices(id) on delete cascade,
  client_id        uuid not null references public.clients(id) on delete cascade,
  client_member_id uuid not null references public.client_members(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (option_id, client_member_id)
);
create index if not exists session_poll_marks_poll_idx
  on public.session_poll_marks (poll_id);

alter table public.session_polls enable row level security;
alter table public.session_poll_options enable row level security;
alter table public.session_poll_marks enable row level security;

-- Polls and options: the practice writes, both sides read. The client
-- never creates or edits a poll (gate 3H-5); no session deletes
-- anything (closing is a status, the trail stays).
create policy session_polls_read on public.session_polls
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy session_polls_insert on public.session_polls
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
create policy session_polls_update on public.session_polls
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'engagement.write'))
  with check (private.keystone_can(practice_id, null, 'engagement.write'));

create policy session_poll_options_read on public.session_poll_options
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy session_poll_options_insert on public.session_poll_options
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));

-- Marks: read by both sides (the tally with names IS the product, gate
-- 3H-2). The client writes only as themselves, only on their own
-- client's OPEN poll, with every scope column matching the parent
-- option so a forged scope never lands. Delete admits only your own
-- mark while the poll is open (changed my mind is honest here; this is
-- coordination, not a coaching record). No update policy.
create policy session_poll_marks_read on public.session_poll_marks
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy session_poll_marks_insert on public.session_poll_marks
  for insert to authenticated
  with check (
    private.owns_client_membership(client_member_id)
    and exists (
      select 1
      from public.client_members cm
      where cm.id = session_poll_marks.client_member_id
        and cm.client_id = session_poll_marks.client_id
    )
    and exists (
      select 1
      from public.session_poll_options o
      join public.session_polls p on p.id = o.poll_id
      where o.id = session_poll_marks.option_id
        and o.poll_id = session_poll_marks.poll_id
        and o.engagement_id = session_poll_marks.engagement_id
        and o.practice_id = session_poll_marks.practice_id
        and o.client_id = session_poll_marks.client_id
        and p.status = 'open'
    )
  );
create policy session_poll_marks_delete on public.session_poll_marks
  for delete to authenticated
  using (
    private.owns_client_membership(client_member_id)
    and exists (
      select 1 from public.session_polls p
      where p.id = session_poll_marks.poll_id
        and p.status = 'open'
    )
  );
