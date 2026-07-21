-- The Confidence Check-in (SafeSpace agreement section 3(e)): a fixed
-- instrument per engagement, a monthly schedule, point-in-time self
-- ratings. Growth is described and watched over time, never scored
-- against anyone else.
--
-- Tenancy note (the prompt's CONFIRM-1): the spec sketch assumed an
-- engagement_members table with a coachee/founder posture. Keystone has
-- no such table; the coachee concept lives per-assignment (action_items
-- assigned_client_member_id, the V2-4 wall). So a fourth table,
-- confidence_participants, names the coachees per engagement, and a
-- response belongs to a client_members row, not a raw auth user. The
-- walls this buys, in the homework_activity spirit:
--
--   - Operators (practice members): full access to the instrument and
--     schedule, read access to every response of their practice.
--   - Participants (the named coachees): read the items and check-ins
--     of their engagement, insert and read ONLY their own responses.
--   - Everyone else (a founder or teammate on the same client, another
--     client, another practice, a stranger): nothing, not even the
--     instrument. A buyer never reads a coachee's self-rating.
--   - No UPDATE or DELETE on responses for any session: a submission is
--     a point-in-time measure; the unique key blocks resubmission.

-- ---------------------------------------------------------------------
-- 1. The instrument: fixed items, seeded per engagement
-- ---------------------------------------------------------------------

create table if not exists public.confidence_items (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  domain        text not null check (domain in ('fundraising','departments','mindset','open')),
  prompt        text not null,
  kind          text not null check (kind in ('scale','text')),
  sort_order    int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
-- The seed's idempotency key: one item per slot per engagement.
create unique index if not exists confidence_items_order_uniq
  on public.confidence_items (engagement_id, sort_order);

-- ---------------------------------------------------------------------
-- 2. The schedule: baseline plus the monthly cadence
-- ---------------------------------------------------------------------

create table if not exists public.confidence_checkins (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  label         text not null,
  opens_at      date not null,
  due_at        date not null,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  check (due_at >= opens_at)
);
create unique index if not exists confidence_checkins_label_uniq
  on public.confidence_checkins (engagement_id, label);
create index if not exists confidence_checkins_open_idx
  on public.confidence_checkins (engagement_id, opens_at);

-- ---------------------------------------------------------------------
-- 3. The participants: which client members take the instrument
-- ---------------------------------------------------------------------

create table if not exists public.confidence_participants (
  id               uuid not null primary key default gen_random_uuid(),
  engagement_id    uuid not null references public.engagements(id) on delete cascade,
  practice_id      uuid not null references public.practices(id) on delete cascade,
  client_id        uuid not null references public.clients(id) on delete cascade,
  client_member_id uuid not null references public.client_members(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (engagement_id, client_member_id)
);
create index if not exists confidence_participants_member_idx
  on public.confidence_participants (client_member_id);

-- Is the caller a named participant of this engagement? SECURITY
-- DEFINER like the other membership predicates (0001/0005): it reads
-- the participant and membership tables under their own RLS otherwise,
-- and it must resolve from auth.uid() alone.
create or replace function private.is_confidence_participant(p_engagement uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.confidence_participants cp
    join public.client_members cm on cm.id = cp.client_member_id
    where cp.engagement_id = p_engagement
      and cm.user_id = auth.uid()
      and cm.revoked_at is null
  );
$$;
revoke all on function private.is_confidence_participant(uuid) from public, anon;
grant execute on function private.is_confidence_participant(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. The responses: one person, one item, one check-in, once
-- ---------------------------------------------------------------------

create table if not exists public.confidence_responses (
  id               uuid primary key default gen_random_uuid(),
  checkin_id       uuid not null references public.confidence_checkins(id) on delete cascade,
  item_id          uuid not null references public.confidence_items(id) on delete cascade,
  engagement_id    uuid not null references public.engagements(id) on delete cascade,
  practice_id      uuid not null references public.practices(id) on delete cascade,
  client_id        uuid not null references public.clients(id) on delete cascade,
  client_member_id uuid not null references public.client_members(id) on delete cascade,
  score            int check (score between 0 and 10),
  text_answer      text,
  submitted_at     timestamptz not null default now(),
  unique (checkin_id, item_id, client_member_id),
  check (num_nonnulls(score, text_answer) = 1)
);
create index if not exists confidence_responses_checkin_idx
  on public.confidence_responses (checkin_id, client_member_id);
create index if not exists confidence_responses_engagement_idx
  on public.confidence_responses (engagement_id);

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------

alter table public.confidence_items        enable row level security;
alter table public.confidence_checkins     enable row level security;
alter table public.confidence_participants enable row level security;
alter table public.confidence_responses    enable row level security;

-- The instrument and the schedule: the practice reads everything of its
-- scope; a participant reads their own engagement's. A founder is NOT a
-- participant and reads nothing here (the card never renders for them).
create policy confidence_items_read on public.confidence_items
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_confidence_participant(engagement_id)
  );
create policy confidence_checkins_read on public.confidence_checkins
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_confidence_participant(engagement_id)
  );

-- Writes on instrument and schedule are the practice's alone.
create policy confidence_items_insert on public.confidence_items
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy confidence_items_update on public.confidence_items
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy confidence_items_delete on public.confidence_items
  for delete to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'));

create policy confidence_checkins_insert on public.confidence_checkins
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy confidence_checkins_update on public.confidence_checkins
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy confidence_checkins_delete on public.confidence_checkins
  for delete to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'));

-- Participants: the practice manages the list; a member sees their own
-- row (that is how the home knows to show the card), never the roster.
create policy confidence_participants_read on public.confidence_participants
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.owns_client_membership(client_member_id)
  );
create policy confidence_participants_insert on public.confidence_participants
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy confidence_participants_delete on public.confidence_participants
  for delete to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'));

-- Responses. READ is the wall: the practice, or the person themselves.
-- Deliberately NOT the whole-client membership predicate: a founder or
-- teammate reads nothing here, ever (the section 3(e) wall).
create policy confidence_responses_read on public.confidence_responses
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.owns_client_membership(client_member_id)
  );

-- INSERT: self-authored, participant-only, into an OPEN check-in, with
-- the scope columns matching the parents so a forged scope never lands,
-- and the answer shape matching the item's kind (a scale item takes a
-- score, a text item takes words, never both).
create policy confidence_responses_insert on public.confidence_responses
  for insert to authenticated
  with check (
    private.owns_client_membership(client_member_id)
    and exists (
      select 1 from public.confidence_participants cp
      where cp.engagement_id = confidence_responses.engagement_id
        and cp.client_member_id = confidence_responses.client_member_id
    )
    and exists (
      select 1 from public.confidence_checkins cc
      where cc.id = confidence_responses.checkin_id
        and cc.engagement_id = confidence_responses.engagement_id
        and cc.practice_id = confidence_responses.practice_id
        and cc.client_id = confidence_responses.client_id
        and cc.opens_at <= current_date
    )
    and exists (
      select 1 from public.confidence_items ci
      where ci.id = confidence_responses.item_id
        and ci.engagement_id = confidence_responses.engagement_id
        and ci.practice_id = confidence_responses.practice_id
        and ci.client_id = confidence_responses.client_id
        and ci.active
        and ((ci.kind = 'scale' and confidence_responses.score is not null)
          or (ci.kind = 'text' and confidence_responses.text_answer is not null))
    )
  );

-- NO update policy. NO delete policy. A submission is a point-in-time
-- measure; the unique key (checkin, item, person) blocks resubmission.
