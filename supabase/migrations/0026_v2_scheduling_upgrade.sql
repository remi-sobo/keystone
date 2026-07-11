-- V2 4I: the scheduling upgrade (specs/keystone-v2-scheduling-upgrade.md).
-- Numbered 0026: the spec said 0025, taken live by 4D mid-build.
--
-- Three tables. scheduling_settings holds the practice's boundaries
-- (buffer, notice, horizon, duration offer, the video link); both sides
-- read it because the pure-RLS client booking page must offer honest
-- slots. scheduling_blackouts is practice-only: clients receive blackout
-- time as anonymous busy intervals through the bridge function, never as
-- dated rows with reasons (gate 4I-5). calendar_busy caches the
-- practice's real Google free/busy, deny-all like google_connections:
-- written by the service role during a pull, read by nobody directly.
-- The Ring 2 bridge function widens to union all three busy sources.

-- ---------------------------------------------------------------------
-- scheduling_settings (one row per practice; absent means defaults)
-- ---------------------------------------------------------------------

create table if not exists public.scheduling_settings (
  id                   uuid primary key default gen_random_uuid(),
  practice_id          uuid not null unique references public.practices(id) on delete cascade,
  buffer_min           int not null default 15 check (buffer_min between 0 and 120),
  lead_hours           int not null default 24 check (lead_hours between 0 and 336),
  horizon_days         int not null default 30 check (horizon_days between 1 and 60),
  -- The durations a booker may choose (gate 4I-3); 60 is the standing
  -- default. Narrowing the offer is a settings edit, never a migration;
  -- the check pins the offer universe so no writer can invent a length.
  duration_options     int[] not null default '{60,90,120}'
                       check (duration_options <@ '{60,90,120}'::int[]
                              and array_length(duration_options, 1) >= 1),
  default_duration_min int not null default 60
                       check (default_duration_min in (60, 90, 120)),
  -- The practice's personal meeting room link (gate 4I-1, closing V1
  -- CONFIRM 8). Snapshotted onto sessions at booking; a later edit
  -- never rewrites history.
  video_link           text,
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- scheduling_blackouts (practice-only rows; clients see busy time only)
-- ---------------------------------------------------------------------

create table if not exists public.scheduling_blackouts (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists scheduling_blackouts_practice_idx
  on public.scheduling_blackouts (practice_id, starts_at);

-- ---------------------------------------------------------------------
-- calendar_busy (deny-all: the practice's real calendar is its own)
-- ---------------------------------------------------------------------

create table if not exists public.calendar_busy (
  id                 uuid primary key default gen_random_uuid(),
  practice_id        uuid not null references public.practices(id) on delete cascade,
  practice_member_id uuid not null references public.practice_members(id) on delete cascade,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  synced_at          timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists calendar_busy_practice_idx
  on public.calendar_busy (practice_id, starts_at);
create index if not exists calendar_busy_member_idx
  on public.calendar_busy (practice_member_id);

-- The Settings card states the last pull in plain words; the stamp
-- lives on the deny-all connection row (service role only, like the
-- tokens beside it).
alter table public.google_connections
  add column if not exists busy_pulled_at timestamptz;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.scheduling_settings enable row level security;
alter table public.scheduling_blackouts enable row level security;
alter table public.calendar_busy enable row level security;

-- Settings: both sides read (the client booking page needs the
-- boundaries and duration offer under pure RLS); the practice writes.
-- No delete: defaults are a reset, not a removal.
create policy scheduling_settings_read on public.scheduling_settings
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_client_member_of_practice(practice_id)
  );
create policy scheduling_settings_insert on public.scheduling_settings
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
create policy scheduling_settings_update on public.scheduling_settings
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'engagement.write'))
  with check (private.keystone_can(practice_id, null, 'engagement.write'));

-- Blackouts: practice-only reads (gate 4I-5); insert and delete through
-- the permission authority. No update: remove and re-add is honest for
-- an operational range.
create policy scheduling_blackouts_read on public.scheduling_blackouts
  for select to authenticated
  using (private.is_practice_member(practice_id));
create policy scheduling_blackouts_insert on public.scheduling_blackouts
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'engagement.write'));
create policy scheduling_blackouts_delete on public.scheduling_blackouts
  for delete to authenticated
  using (private.keystone_can(practice_id, null, 'engagement.write'));

-- calendar_busy: RLS on, ZERO policies. Deny-all to every session; only
-- the service role writes it during a pull, and reads cross the wall
-- solely through keystone_busy_intervals (SECURITY.md).

-- ---------------------------------------------------------------------
-- The bridge widens: three busy sources, one bare shape
-- ---------------------------------------------------------------------

-- Same contract as Ring 2: bare (starts_at, ends_at) only, no ids, no
-- titles, no identities, membership-checked on both sides of the wall,
-- future-only, capped at 60 days. Sessions, the cached real calendar,
-- and blackout ranges all flatten into indistinguishable busy time.
create or replace function public.keystone_busy_intervals(p_practice uuid)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql security definer stable
set search_path = ''
as $$
  select b.starts_at, b.ends_at
  from (
    select s.starts_at, s.ends_at
    from public.sessions s
    where s.practice_id = p_practice
      and s.status in ('booked','held')
    union all
    select cb.starts_at, cb.ends_at
    from public.calendar_busy cb
    where cb.practice_id = p_practice
    union all
    select sb.starts_at, sb.ends_at
    from public.scheduling_blackouts sb
    where sb.practice_id = p_practice
  ) b
  where b.ends_at > now()
    and b.starts_at < now() + interval '60 days'
    and (
      private.is_practice_member(p_practice)
      or private.is_client_member_of_practice(p_practice)
    );
$$;
revoke all on function public.keystone_busy_intervals(uuid) from public, anon;
grant execute on function public.keystone_busy_intervals(uuid) to authenticated;
