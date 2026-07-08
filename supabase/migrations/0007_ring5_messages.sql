-- Ring 5: messages (specs/keystone.md sections 4 and 5.1).
--
-- Threaded per engagement: one thread per engagement in v1 (the unique
-- constraint says so honestly; lifting it later is a migration, not a
-- surprise). No live chat presence, no typing indicators. The client
-- writes and the practice gets an email; the practice replies in-app
-- and the client gets an email; each email deep-links into the thread.
--
--   message_threads   the container, both scope columns, one per
--                     engagement
--   messages          author-stamped rows; author_side denormalizes
--                     which wall the author stood behind so read states
--                     and the unanswered queue never join to memberships
--
-- Read state: read_at on a message is set by the OTHER side on view.
-- Column-level grant: sessions may UPDATE only read_at, so no one can
-- edit anyone's words after the fact; body is immutable to every
-- session and there is no delete policy (correspondence is a record).

create table if not exists public.message_threads (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (engagement_id)
);

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.message_threads(id) on delete cascade,
  engagement_id  uuid not null references public.engagements(id) on delete cascade,
  practice_id    uuid not null references public.practices(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_side    text not null check (author_side in ('practice','client')),
  body           text not null check (char_length(body) between 1 and 8000),
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at);
create index if not exists messages_unread_idx
  on public.messages (practice_id, author_side, created_at desc)
  where read_at is null;

-- The client write rides the permission authority like booking does.
insert into public.role_permissions (role, permission) values
  ('client_member', 'message.write'),
  ('owner',         'message.write'),
  ('consultant',    'message.write')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

create policy message_threads_read on public.message_threads
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
-- Either side may open the thread; the client side only inside its own
-- client scope, through the permission authority.
create policy message_threads_insert on public.message_threads
  for insert to authenticated
  with check (
    private.is_practice_member(practice_id)
    or private.keystone_can(practice_id, client_id, 'message.write')
  );

create policy messages_read on public.messages
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
-- You write only as yourself, only from the wall you actually stand
-- behind, only inside your own scope.
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and (
      (author_side = 'practice' and private.is_practice_member(practice_id))
      or (
        author_side = 'client'
        and private.is_member_of_client(client_id)
        and private.keystone_can(practice_id, client_id, 'message.write')
      )
    )
  );
-- The update path exists ONLY for read receipts: the row policy admits
-- members of either wall, and the column grant below limits every
-- session to read_at. No delete policy: the record stays.
create policy messages_mark_read on public.messages
  for update to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  )
  with check (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );

revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

-- ---------------------------------------------------------------------
-- Notify targets for the client surface (minimal disclosure)
-- ---------------------------------------------------------------------

-- The client surface is pure RLS and cannot read practice_members, but
-- a client message must produce an email to the practice. Same pattern
-- as keystone_busy_intervals: SECURITY DEFINER, membership-checked,
-- pinned search_path, and it discloses the minimum that the job needs,
-- the OWNER emails of the caller's own practice. No names, no roles, no
-- other rows.
create or replace function public.keystone_message_notify_targets(p_engagement uuid)
returns table (email text)
language sql security definer stable
set search_path = ''
as $$
  select pm.email
  from public.practice_members pm
  join public.engagements e on e.practice_id = pm.practice_id
  join public.client_members cm
    on cm.client_id = e.client_id and cm.user_id = auth.uid()
  where e.id = p_engagement
    and pm.role = 'owner'
    and pm.user_id is not null;
$$;
revoke all on function public.keystone_message_notify_targets(uuid) from public, anon;
grant execute on function public.keystone_message_notify_targets(uuid) to authenticated;
