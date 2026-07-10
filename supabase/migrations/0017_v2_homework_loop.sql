-- V2 3C: the homework accountability loop (specs/keystone-v2-homework.md).
--
-- Homework grows from a checklist into a coaching loop with two speeds:
-- check-off items keep today's behavior; review items gain submit,
-- feedback, accept. The V2-4 buyer wall is mechanical, not cosmetic:
-- action_items.status stays open/done (the row every client member can
-- read), and the granular loop state (submitted, needs revision,
-- blocked) lives ONLY in homework_activity, whose read policy admits
-- the practice and the assigned coachee, never a teammate or buyer.
-- The trail is append-only for every session: a coaching record you
-- can quietly rewrite is not a record.
--
-- Also lands the audience wall (3A gate 3A-1, transferred here by gate
-- 3C-5): internal practice tasks become invisible to client sessions.

-- ---------------------------------------------------------------------
-- 1. action_items: a body, the review toggle, the audience column
-- ---------------------------------------------------------------------

alter table public.action_items
  add column if not exists body_md text,
  add column if not exists review_requested boolean not null default false,
  add column if not exists audience text not null default 'client'
    check (audience in ('client','practice'));

-- ---------------------------------------------------------------------
-- 2. The audience wall: client sessions read client-audience items only
-- ---------------------------------------------------------------------

drop policy if exists action_items_read on public.action_items;
create policy action_items_read on public.action_items
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or (audience = 'client' and private.is_member_of_client(client_id))
  );

-- Check-off tightened: a review item is never self-completed; accepting
-- is the consultant's move, recorded in the trail.
drop policy if exists action_items_checkoff on public.action_items;
create policy action_items_checkoff on public.action_items
  for update to authenticated
  using (
    private.owns_client_membership(assigned_client_member_id)
    and review_requested = false
  )
  with check (
    private.owns_client_membership(assigned_client_member_id)
    and review_requested = false
  );

-- ---------------------------------------------------------------------
-- 3. Self-authorship for the practice side of the trail
-- ---------------------------------------------------------------------

create or replace function private.owns_practice_membership(p_member uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.practice_members
    where id = p_member and user_id = auth.uid()
      and revoked_at is null
  );
$$;
revoke all on function private.owns_practice_membership(uuid) from public, anon;
grant execute on function private.owns_practice_membership(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. homework_activity: the loop itself, walled and append-only
-- ---------------------------------------------------------------------

create table if not exists public.homework_activity (
  id             uuid primary key default gen_random_uuid(),
  action_item_id uuid not null references public.action_items(id) on delete cascade,
  engagement_id  uuid not null references public.engagements(id) on delete cascade,
  practice_id    uuid not null references public.practices(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  -- Authored by exactly one person, on exactly one side of the table.
  author_client_member_id   uuid references public.client_members(id) on delete set null,
  author_practice_member_id uuid references public.practice_members(id) on delete set null,
  kind           text not null check (kind in
                 ('comment','submission','send_back','acceptance','blocked','unblocked')),
  body_md        text,
  link_url       text,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(author_client_member_id, author_practice_member_id) = 1)
);
create index if not exists homework_activity_item_idx
  on public.homework_activity (action_item_id, created_at desc);
create index if not exists homework_activity_queue_idx
  on public.homework_activity (practice_id, kind, created_at desc);

alter table public.homework_activity enable row level security;

-- READ is the wall (V2-4, decided): the practice, or the coachee the
-- parent item is assigned to. Deliberately NOT is_member_of_client;
-- a teammate or buyer reads nothing here, ever.
create policy homework_activity_read on public.homework_activity
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or exists (
      select 1 from public.action_items ai
      where ai.id = homework_activity.action_item_id
        and private.owns_client_membership(ai.assigned_client_member_id)
    )
  );

-- The coachee writes on their own item only, as themselves, with the
-- coachee kinds; the scope columns must match the parent so a forged
-- scope never lands.
create policy homework_activity_client_insert on public.homework_activity
  for insert to authenticated
  with check (
    author_practice_member_id is null
    and private.owns_client_membership(author_client_member_id)
    and kind in ('comment','submission','blocked','unblocked')
    and exists (
      select 1 from public.action_items ai
      where ai.id = homework_activity.action_item_id
        and ai.engagement_id = homework_activity.engagement_id
        and ai.practice_id = homework_activity.practice_id
        and ai.client_id = homework_activity.client_id
        and ai.audience = 'client'
        and private.owns_client_membership(ai.assigned_client_member_id)
    )
  );

-- The practice writes feedback as itself (the app path is service role
-- after the check; this mirror keeps RLS as defense in depth).
create policy homework_activity_practice_insert on public.homework_activity
  for insert to authenticated
  with check (
    author_client_member_id is null
    and private.owns_practice_membership(author_practice_member_id)
    and private.keystone_can(practice_id, client_id, 'engagement.write')
    and kind in ('comment','send_back','acceptance')
    and exists (
      select 1 from public.action_items ai
      where ai.id = homework_activity.action_item_id
        and ai.engagement_id = homework_activity.engagement_id
        and ai.practice_id = homework_activity.practice_id
        and ai.client_id = homework_activity.client_id
    )
  );

-- NO update policy. NO delete policy. Append-only for every session:
-- corrections are new rows (the decisions discipline, gate 3C-3).
