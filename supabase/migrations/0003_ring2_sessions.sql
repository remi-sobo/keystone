-- Ring 2: sessions and scheduling (specs/keystone.md sections 4, 5.1).
--
-- Three tables: sessions (the lifecycle rows Google Calendar mirrors),
-- availability_windows (when the consultant can be booked), and
-- google_connections (encrypted OAuth tokens, deny-all). Sessions and
-- windows carry the two-level scope like every spine table; the token
-- store is service-role only because tokens are credentials.

-- ---------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------

create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  -- The IANA zone the booking was made in, so wall-clock times render
  -- and push correctly in both timezones (spec section 8).
  tz            text not null default 'America/Los_Angeles',
  location      text,
  -- donor_call covers the calls SafeSpace asks the consultant to join;
  -- they schedule like sessions, notes stay lighter (spec 5.1).
  kind          text not null default 'working'
                check (kind in ('working','donor_call','review')),
  gcal_event_id text,
  status        text not null default 'booked'
                check (status in ('proposed','booked','held','canceled')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sessions_engagement_idx on public.sessions (engagement_id, starts_at);
create index if not exists sessions_practice_time_idx on public.sessions (practice_id, starts_at);

-- The hard wall against double-booking: no two live sessions of one
-- practice may overlap, regardless of what any surface computed. A
-- client booking a just-taken slot gets a constraint error (23P01) and
-- the UI says so honestly.
create extension if not exists btree_gist;
do $$ begin
  alter table public.sessions add constraint sessions_no_overlap
    exclude using gist (
      practice_id with =,
      tstzrange(starts_at, ends_at) with &&
    ) where (status in ('booked','held'));
exception when duplicate_table or duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- availability_windows
-- ---------------------------------------------------------------------

create table if not exists public.availability_windows (
  id                 uuid primary key default gen_random_uuid(),
  practice_id        uuid not null references public.practices(id) on delete cascade,
  practice_member_id uuid not null references public.practice_members(id) on delete cascade,
  -- 0 = Sunday through 6 = Saturday, in the window's own tz.
  weekday            int not null check (weekday between 0 and 6),
  start_min          int not null check (start_min between 0 and 1439),
  end_min            int not null check (end_min between 1 and 1440),
  tz                 text not null default 'America/Los_Angeles',
  created_at         timestamptz not null default now(),
  check (end_min > start_min)
);
create index if not exists availability_windows_practice_idx
  on public.availability_windows (practice_id, weekday);

-- ---------------------------------------------------------------------
-- google_connections (deny-all: tokens are credentials)
-- ---------------------------------------------------------------------

create table if not exists public.google_connections (
  id                 uuid primary key default gen_random_uuid(),
  practice_id        uuid not null references public.practices(id) on delete cascade,
  practice_member_id uuid not null references public.practice_members(id) on delete cascade unique,
  google_email       text,
  -- AES-256-GCM blobs (src/lib/crypto.ts); never plaintext, never
  -- readable by any session role.
  access_token_enc   text,
  refresh_token_enc  text,
  token_expiry       timestamptz,
  calendar_tz        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Permissions: booking is the one client write in Ring 2
-- ---------------------------------------------------------------------

insert into public.role_permissions (role, permission) values
  ('client_member', 'session.book'),
  ('owner',         'session.book'),
  ('consultant',    'session.book')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.sessions enable row level security;
alter table public.availability_windows enable row level security;
alter table public.google_connections enable row level security;

-- sessions: both dimensions on the read, like every engagement table.
create policy sessions_read on public.sessions
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
-- Booking: a client member books within their OWN client (session.book
-- carries the client dimension through keystone_can); consultants write
-- through engagement.write.
create policy sessions_write on public.sessions
  for insert to authenticated
  with check (
    private.keystone_can(practice_id, client_id, 'engagement.write')
    or private.keystone_can(practice_id, client_id, 'session.book')
  );
create policy sessions_update on public.sessions
  for update to authenticated
  using (
    private.keystone_can(practice_id, client_id, 'engagement.write')
    or private.keystone_can(practice_id, client_id, 'session.book')
  )
  with check (
    private.keystone_can(practice_id, client_id, 'engagement.write')
    or private.keystone_can(practice_id, client_id, 'session.book')
  );

-- availability_windows: any member of the practice, or a client member
-- under it, may read (clients need the windows to pick a slot); only
-- consultants write.
create policy availability_windows_read on public.availability_windows
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_client_member_of_practice(practice_id)
  );
create policy availability_windows_write on public.availability_windows
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
create policy availability_windows_delete on public.availability_windows
  for delete to authenticated
  using (private.keystone_can(practice_id, null, 'engagement.write'));

-- google_connections: RLS on, ZERO policies. Deny-all to every session;
-- only the service role, behind requirePracticeMember in the calendar
-- routes, ever touches it (SECURITY.md).

-- ---------------------------------------------------------------------
-- Busy intervals: minimal disclosure for slot math
-- ---------------------------------------------------------------------

-- A client member cannot read other clients' sessions (by design), but
-- slot computation must exclude EVERY live session of the practice.
-- This SECURITY DEFINER function returns bare intervals only: no ids,
-- no titles, no client identity. Busy-or-free is inherent to any
-- booking surface; nothing else crosses the wall.
create or replace function public.keystone_busy_intervals(p_practice uuid)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql security definer stable
set search_path = ''
as $$
  select s.starts_at, s.ends_at
  from public.sessions s
  where s.practice_id = p_practice
    and s.status in ('booked','held')
    and s.ends_at > now()
    and s.starts_at < now() + interval '60 days'
    and (
      private.is_practice_member(p_practice)
      or private.is_client_member_of_practice(p_practice)
    );
$$;
revoke all on function public.keystone_busy_intervals(uuid) from public, anon;
grant execute on function public.keystone_busy_intervals(uuid) to authenticated;
