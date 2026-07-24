-- Standing availability marks (Remi's ask, Session 2 week): the date
-- poll's coordination without the open-a-poll ceremony. The client team
-- always sees the practice's real offered slots on their sessions page
-- (the Ring 2 grid, recomputed from the live calendar); instead of
-- instant self-booking they mark the times that work, the operator
-- watches the marks gather on the engagement page, and CONFIRM is the
-- one move that books: the session row, the snapshotted video link, and
-- the calendar invite ride the existing 4I rails unchanged.
--
-- A mark is coordination, not a record (the 3H posture): toggling is
-- honest, confirm sweeps the engagement's marks so the next round
-- starts clean, and nothing here creates a session by itself.
--
-- The wall is the 0018 marks shape: both sides read (the team
-- coordinates in the open, teammate names show like the poll), a member
-- inserts only their own mark inside their own scope, and only a future
-- time. There is no parent option row here, so a hand-crafted insert
-- could mark a time the practice never offered; that lands as tally
-- noise at worst, because the operator surface intersects marks with
-- the server-recomputed offer and the confirm action re-verifies the
-- slot before any session exists.

create table if not exists public.slot_interest (
  id               uuid primary key default gen_random_uuid(),
  engagement_id    uuid not null references public.engagements(id) on delete cascade,
  practice_id      uuid not null references public.practices(id) on delete cascade,
  client_id        uuid not null references public.clients(id) on delete cascade,
  client_member_id uuid not null references public.client_members(id) on delete cascade,
  starts_at        timestamptz not null,
  tz               text not null,
  duration_minutes int not null default 60
                   check (duration_minutes between 15 and 240),
  created_at       timestamptz not null default now(),
  unique (engagement_id, client_member_id, starts_at, duration_minutes)
);
create index if not exists slot_interest_engagement_idx
  on public.slot_interest (engagement_id, starts_at);
create index if not exists slot_interest_practice_idx
  on public.slot_interest (practice_id);

alter table public.slot_interest enable row level security;

create policy slot_interest_read on public.slot_interest
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );

create policy slot_interest_insert on public.slot_interest
  for insert to authenticated
  with check (
    private.owns_client_membership(client_member_id)
    and exists (
      select 1 from public.client_members cm
      where cm.id = slot_interest.client_member_id
        and cm.client_id = slot_interest.client_id
    )
    and exists (
      select 1 from public.engagements e
      where e.id = slot_interest.engagement_id
        and e.practice_id = slot_interest.practice_id
        and e.client_id = slot_interest.client_id
    )
    and slot_interest.starts_at > now()
  );

-- A member takes back their own mark; the practice sweeps the round
-- clean at confirm. No update path: a mark is on or off.
create policy slot_interest_delete on public.slot_interest
  for delete to authenticated
  using (
    private.owns_client_membership(client_member_id)
    or private.is_practice_member(practice_id)
  );
