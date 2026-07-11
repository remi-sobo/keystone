-- V2 5E: change orders (specs/keystone-v2-change-orders.md).
--
-- The pressure valve for the boundary. When the client asks for
-- something outside the walls, the answer is not a flat no and not a
-- quiet yes that erodes the scope; it is a change order: the ask in
-- writing, the decision in writing, both sides reading the same page.
-- Per CONFIRM V2-6 (fee half decided 2026-07-09; the change-order
-- half taken as recommended): NO fee column, structurally. A change
-- order carries scope words; numbers live in the conversation and in
-- Trellis, never here. Payments stay off-platform, as V1 decided.
--
-- Both sides read (the whole point is a shared page); the client
-- writes only the ASK (self-authored, open, no answer fields); the
-- practice writes the DECISION. Nobody deletes: a declined ask is a
-- boundary held, and that is worth keeping.

create table if not exists public.change_orders (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  title         text not null,
  description_md text,
  requested_by_client_member_id   uuid references public.client_members(id) on delete set null,
  requested_by_practice_member_id uuid references public.practice_members(id) on delete set null,
  status        text not null default 'open' check (status in ('open','agreed','declined')),
  response_md   text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists change_orders_engagement_idx
  on public.change_orders (engagement_id, created_at desc);

alter table public.change_orders enable row level security;

create policy change_orders_read on public.change_orders
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
-- The client raises an ASK: self-authored, open, answer fields empty,
-- and the scope columns must match a real engagement of their client.
create policy change_orders_client_insert on public.change_orders
  for insert to authenticated
  with check (
    status = 'open'
    and response_md is null
    and decided_at is null
    and requested_by_practice_member_id is null
    and private.owns_client_membership(requested_by_client_member_id)
    and exists (
      select 1 from public.engagements e
      where e.id = change_orders.engagement_id
        and e.client_id = change_orders.client_id
        and e.practice_id = change_orders.practice_id
    )
  );
-- The practice can raise one too (naming the drift it sees).
create policy change_orders_practice_insert on public.change_orders
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
-- Only the practice decides; the client never edits the ask or the
-- answer.
create policy change_orders_update on public.change_orders
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
-- No delete policy: a declined ask is a boundary held.

-- 4F grows the two change-order kinds.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in
        ('homework_submitted','homework_feedback','homework_due','homework_overdue',
         'poll_opened','poll_booked','deliverable_shipped','approval_waiting','message_reply',
         'session_reminder','approval_decided','closeout_published',
         'change_order_requested','change_order_decided'));
