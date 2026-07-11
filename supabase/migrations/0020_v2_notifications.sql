-- V2 4F: the notifications layer (specs/keystone-v2-notifications.md).
--
-- One table of notification events behind a RECIPIENT wall: your inbox
-- is yours, so the read policy admits only the owner of the recipient
-- membership, never the client roster (a teammate reads zero of your
-- rows). Sessions never insert or delete; rows are emitted only through
-- the lib/notify.ts chokepoint (service role after the acting site's
-- own checks). The one session write is read_at on your own rows, the
-- messages column-grant discipline. Prefs are one row per person,
-- readable and writable by their owner alone: every user has a mute.

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete cascade,
  engagement_id uuid references public.engagements(id) on delete cascade,
  -- The recipient: exactly one person, on exactly one side.
  recipient_client_member_id   uuid references public.client_members(id) on delete cascade,
  recipient_practice_member_id uuid references public.practice_members(id) on delete cascade,
  kind  text not null check (kind in
        ('homework_submitted','homework_feedback','homework_due','homework_overdue',
         'poll_opened','poll_booked','deliverable_shipped','approval_waiting','message_reply')),
  title text not null,
  href  text not null,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  emailed_at timestamptz,
  check (num_nonnulls(recipient_client_member_id, recipient_practice_member_id) = 1)
);
create index if not exists notifications_client_recipient_idx
  on public.notifications (recipient_client_member_id, read_at, created_at desc);
create index if not exists notifications_practice_recipient_idx
  on public.notifications (recipient_practice_member_id, read_at, created_at desc);
create index if not exists notifications_unemailed_idx
  on public.notifications (emailed_at, created_at) where (emailed_at is null);

create table if not exists public.notification_prefs (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  client_member_id   uuid references public.client_members(id) on delete cascade,
  practice_member_id uuid references public.practice_members(id) on delete cascade,
  email_mode  text not null default 'batched' check (email_mode in ('batched','off')),
  updated_at  timestamptz not null default now(),
  check (num_nonnulls(client_member_id, practice_member_id) = 1),
  unique (client_member_id),
  unique (practice_member_id)
);

alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;

-- The recipient wall: only the owner of the recipient membership reads.
create policy notifications_read on public.notifications
  for select to authenticated
  using (
    private.owns_client_membership(recipient_client_member_id)
    or private.owns_practice_membership(recipient_practice_member_id)
  );
-- The one session write: marking your own rows read. The column grant
-- below limits it to read_at; no insert or delete policy exists.
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (
    private.owns_client_membership(recipient_client_member_id)
    or private.owns_practice_membership(recipient_practice_member_id)
  )
  with check (
    private.owns_client_membership(recipient_client_member_id)
    or private.owns_practice_membership(recipient_practice_member_id)
  );
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Prefs: yours alone, both directions, with the scope column honest.
create policy notification_prefs_read on public.notification_prefs
  for select to authenticated
  using (
    private.owns_client_membership(client_member_id)
    or private.owns_practice_membership(practice_member_id)
  );
create policy notification_prefs_insert on public.notification_prefs
  for insert to authenticated
  with check (
    (
      private.owns_client_membership(client_member_id)
      and exists (
        select 1 from public.client_members cm
        where cm.id = notification_prefs.client_member_id
          and cm.practice_id = notification_prefs.practice_id
      )
    )
    or (
      private.owns_practice_membership(practice_member_id)
      and exists (
        select 1 from public.practice_members pm
        where pm.id = notification_prefs.practice_member_id
          and pm.practice_id = notification_prefs.practice_id
      )
    )
  );
create policy notification_prefs_update on public.notification_prefs
  for update to authenticated
  using (
    private.owns_client_membership(client_member_id)
    or private.owns_practice_membership(practice_member_id)
  )
  with check (
    private.owns_client_membership(client_member_id)
    or private.owns_practice_membership(practice_member_id)
  );
-- No delete: turning email off is a pref, not a row removal.
