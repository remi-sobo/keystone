-- Session deck slides (the weekend runbook's Step 3b): the in-app
-- presenter's system of record. One row per slide of a roadmap
-- session's teaching deck, keyed to engagement_sessions (0038), the
-- slide content in a jsonb payload whose shape is src/lib/deck/types.ts
-- (the discriminated union the DeckRenderer takes). The deck is data,
-- never markup: the eight layout types are fixed by the deck design
-- system and checked here, so a seeded deck can only be one of the
-- shapes the renderer knows.
--
-- Shape follows the Keystone law: both scope ids denormalized on every
-- row (spec 5.1) plus engagement_id, so the client read policy never
-- joins. The policy shape mirrors the roadmap tables (0038, itself the
-- 0011 shape): the practice reads and writes everything of its own; a
-- client member reads only their own client's rows, and never writes.
-- The presenter route is operator-only for now; the client SELECT is
-- the roadmap-mirror the runbook asked for, so a later client-facing
-- deck page is a route change, not a policy change. Unique key on
-- (engagement_session_id, sort_order) so the seed re-runs clean.

create table if not exists public.session_slides (
  id                    uuid primary key default gen_random_uuid(),
  engagement_session_id uuid not null references public.engagement_sessions(id) on delete cascade,
  engagement_id         uuid not null references public.engagements(id) on delete cascade,
  practice_id           uuid not null references public.practices(id) on delete cascade,
  client_id             uuid not null references public.clients(id) on delete cascade,
  sort_order            int not null default 0,
  slide_type            text not null
                        check (slide_type in ('cover','section','idea','agenda','tracks','loop','homework','close')),
  payload               jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);
create unique index if not exists session_slides_order_uniq
  on public.session_slides (engagement_session_id, sort_order);
create index if not exists session_slides_practice_idx
  on public.session_slides (practice_id);

alter table public.session_slides enable row level security;

-- The 0038 shape: practice full within its own walls, client SELECT
-- only, inside their own client.
create policy session_slides_read on public.session_slides
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy session_slides_insert on public.session_slides
  for insert to authenticated
  with check (private.is_practice_member(practice_id));
create policy session_slides_update on public.session_slides
  for update to authenticated
  using (private.is_practice_member(practice_id))
  with check (private.is_practice_member(practice_id));
create policy session_slides_delete on public.session_slides
  for delete to authenticated
  using (private.is_practice_member(practice_id));
