-- The six-month roadmap (SafeSpace scope and sequence; the client's
-- day-one map of the whole engagement).
--
-- Two tables: engagement_phases (the month chapters) and
-- engagement_sessions (the numbered working sessions inside them, S1
-- through S28 for SafeSpace). These are the CURRICULUM, the promise of
-- how the six months are shaped; the existing sessions table stays the
-- system of record for real scheduled bookings (calendar, exclusion
-- constraint, run of show). A roadmap session may later point at its
-- booked twin via scheduled_at, set by the practice when the date lands.
--
-- Shape follows the Keystone law: both scope ids denormalized on every
-- row (spec 5.1; the ask's column list carried practice_id only, and
-- client_id is added here so the client read policy never joins).
-- The policy shape mirrors engagement_documents (0011): the practice
-- reads and writes everything of its own; a client member reads only
-- their own client's rows, and never writes. No visibility flag: the
-- roadmap is client-visible by design, it is the arc they are paying
-- for. Unique keys on (engagement_id, sort_order) and (engagement_id,
-- code) exist so the seed can re-run without duplicating a row.

create table if not exists public.engagement_phases (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  sort_order    int not null default 0,
  -- "Month 1" and "Foundation & the Program" render as one heading;
  -- kept apart so the label can localize to a real calendar month later.
  month_label   text not null,
  title         text not null,
  subtitle      text,
  created_at    timestamptz not null default now()
);
create unique index if not exists engagement_phases_order_uniq
  on public.engagement_phases (engagement_id, sort_order);
create index if not exists engagement_phases_practice_idx
  on public.engagement_phases (practice_id);

create table if not exists public.engagement_sessions (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  phase_id      uuid not null references public.engagement_phases(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  sort_order    int not null default 0,
  code          text not null,
  title         text not null,
  focus         text,
  cadence       text,
  attendees     text,
  status        text not null default 'upcoming'
                check (status in ('upcoming','active','done')),
  -- Set when the real booking lands (month by month, per the scope and
  -- sequence's own rule); the roadmap row never books anything itself.
  scheduled_at  timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists engagement_sessions_code_uniq
  on public.engagement_sessions (engagement_id, code);
create index if not exists engagement_sessions_phase_idx
  on public.engagement_sessions (phase_id, sort_order);
create index if not exists engagement_sessions_practice_idx
  on public.engagement_sessions (practice_id);

alter table public.engagement_phases enable row level security;
alter table public.engagement_sessions enable row level security;

-- The 0011 shape: practice full within its own walls, client SELECT
-- only, inside their own client.
create policy engagement_phases_read on public.engagement_phases
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy engagement_phases_insert on public.engagement_phases
  for insert to authenticated
  with check (private.is_practice_member(practice_id));
create policy engagement_phases_update on public.engagement_phases
  for update to authenticated
  using (private.is_practice_member(practice_id))
  with check (private.is_practice_member(practice_id));
create policy engagement_phases_delete on public.engagement_phases
  for delete to authenticated
  using (private.is_practice_member(practice_id));

create policy engagement_sessions_read on public.engagement_sessions
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy engagement_sessions_insert on public.engagement_sessions
  for insert to authenticated
  with check (private.is_practice_member(practice_id));
create policy engagement_sessions_update on public.engagement_sessions
  for update to authenticated
  using (private.is_practice_member(practice_id))
  with check (private.is_practice_member(practice_id));
create policy engagement_sessions_delete on public.engagement_sessions
  for delete to authenticated
  using (private.is_practice_member(practice_id));
