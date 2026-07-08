-- Ring 1: the Keystone spine (specs/keystone.md sections 3, 5.1, 5.4).
--
-- The two-level scope: practice_id is the top tenant, client_id nests
-- under it. Every scoped table carries practice_id, denormalized even
-- where derivable, so RLS never joins deep and the enumeration gate can
-- assert the column mechanically. Every policy resolves scope from the
-- authenticated user through SECURITY DEFINER helpers with a pinned
-- search_path (the Pathway precedent); nothing trusts a client-supplied
-- id. One permission authority, private.keystone_can, is called by both
-- the RLS policies and the app's clean-403 checks.
--
-- Idempotent by convention: create table/index use if not exists.

create extension if not exists pgcrypto;
create schema if not exists private;

-- ---------------------------------------------------------------------
-- The spine tables
-- ---------------------------------------------------------------------

create table if not exists public.practices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  -- The five-phase arc is the practice default but stored as config, so
  -- a future coach can reshape the arc without a migration (spec 5.1).
  stage_config jsonb not null default '["diagnose","design","build","train","stabilize"]',
  created_at   timestamptz not null default now()
);

create table if not exists public.practice_members (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  -- Email-keyed invite: user_id stays null until the verified JWT email
  -- claims the row on first sign-in (keystone_claim_membership).
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  role        text not null check (role in ('owner','consultant')),
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists practice_members_email_uniq
  on public.practice_members (practice_id, lower(email));
create index if not exists practice_members_user_idx
  on public.practice_members (user_id);

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  name        text not null,
  status      text not null default 'active' check (status in ('active','paused','ended')),
  created_at  timestamptz not null default now()
);
create index if not exists clients_practice_idx on public.clients (practice_id);

create table if not exists public.client_members (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  role        text not null default 'client_member' check (role = 'client_member'),
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists client_members_email_uniq
  on public.client_members (client_id, lower(email));
create index if not exists client_members_user_idx
  on public.client_members (user_id);

create table if not exists public.engagements (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  title       text not null,
  starts_on   date,
  ends_on     date,
  -- Text and optional: CONFIRM 9 decides whether a fee shows anywhere.
  fee_display text,
  status      text not null default 'active' check (status in ('proposed','active','paused','done')),
  created_at  timestamptz not null default now()
);
create index if not exists engagements_practice_idx on public.engagements (practice_id);
create index if not exists engagements_client_idx on public.engagements (client_id);

create table if not exists public.workstreams (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  title         text not null,
  stage         text not null default 'diagnose'
                check (stage in ('diagnose','design','build','train','stabilize','done')),
  sort          int not null default 0,
  color_token   text,
  created_at    timestamptz not null default now()
);
create index if not exists workstreams_engagement_idx on public.workstreams (engagement_id);

create table if not exists public.workstream_stage_events (
  id            uuid primary key default gen_random_uuid(),
  workstream_id uuid not null references public.workstreams(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  from_stage    text,
  to_stage      text not null,
  note          text,
  actor_user_id uuid references auth.users(id) on delete set null,
  at            timestamptz not null default now()
);
create index if not exists stage_events_workstream_idx
  on public.workstream_stage_events (workstream_id, at desc);

-- ---------------------------------------------------------------------
-- The permission authority (BloomOS private.has_permission, two-level)
-- ---------------------------------------------------------------------

create table if not exists public.role_permissions (
  role       text not null,
  permission text not null,
  primary key (role, permission)
);

-- Changing access is a data change, not a policy rewrite.
insert into public.role_permissions (role, permission) values
  ('owner',         'practice.manage'),
  ('owner',         'members.manage'),
  ('owner',         'engagement.read'),
  ('owner',         'engagement.write'),
  ('consultant',    'engagement.read'),
  ('consultant',    'engagement.write'),
  ('client_member', 'engagement.read')
on conflict do nothing;

-- Membership predicates. SECURITY DEFINER breaks RLS recursion (the
-- membership tables carry RLS themselves) and pins search_path.

create or replace function private.is_practice_member(p_practice uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.practice_members
    where user_id = auth.uid() and practice_id = p_practice and user_id is not null
  );
$$;

create or replace function private.is_member_of_client(p_client uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members
    where user_id = auth.uid() and client_id = p_client and user_id is not null
  );
$$;

create or replace function private.is_client_member_of_practice(p_practice uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members
    where user_id = auth.uid() and practice_id = p_practice and user_id is not null
  );
$$;

-- The one permission authority (spec section 5): called by BOTH the RLS
-- policies below and the app's clean-403 checks. A practice member gets
-- role permissions across every client of the practice; a client member
-- gets client_member permissions ONLY where p_client is their own
-- client, so the client dimension can never drop out of a permission
-- decision.
create or replace function private.keystone_can(p_practice uuid, p_client uuid, p_perm text)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_members m
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid()
      and m.practice_id = p_practice
      and rp.permission = p_perm
  ) or exists (
    select 1
    from public.client_members cm
    join public.role_permissions rp on rp.role = cm.role
    where cm.user_id = auth.uid()
      and cm.practice_id = p_practice
      and p_client is not null
      and cm.client_id = p_client
      and rp.permission = p_perm
  );
$$;

grant usage on schema private to authenticated;
revoke all on function private.is_practice_member(uuid) from public, anon;
revoke all on function private.is_member_of_client(uuid) from public, anon;
revoke all on function private.is_client_member_of_practice(uuid) from public, anon;
revoke all on function private.keystone_can(uuid, uuid, text) from public, anon;
grant execute on function private.is_practice_member(uuid) to authenticated;
grant execute on function private.is_member_of_client(uuid) to authenticated;
grant execute on function private.is_client_member_of_practice(uuid) to authenticated;
grant execute on function private.keystone_can(uuid, uuid, text) to authenticated;

-- The email-keyed claim (Pathway pattern): a pending membership row is
-- linked to the caller on first sign-in by the VERIFIED JWT email. The
-- email is the credential; a URL alone grants nothing.
create or replace function public.keystone_claim_membership()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.practice_members
    set user_id = auth.uid(), claimed_at = now()
    where user_id is null
      and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''));
  update public.client_members
    set user_id = auth.uid(), claimed_at = now()
    where user_id is null
      and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''));
end;
$$;

revoke all on function public.keystone_claim_membership() from public, anon;
grant execute on function public.keystone_claim_membership() to authenticated;

-- ---------------------------------------------------------------------
-- RLS: the wall
-- ---------------------------------------------------------------------

alter table public.practices enable row level security;
alter table public.practice_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.engagements enable row level security;
alter table public.workstreams enable row level security;
alter table public.workstream_stage_events enable row level security;
alter table public.role_permissions enable row level security;

-- role_permissions is global reference data: readable by any signed-in
-- user (the app's ctx checks read it), writable only by migrations.
-- Carved out of the isolation matrix as the documented exception.
create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);

-- practices: a member of the practice, or a client member under it, may
-- read the row (the client surface shows "by <practice name>").
create policy practices_read on public.practices
  for select to authenticated
  using (
    private.is_practice_member(id)
    or private.is_client_member_of_practice(id)
  );
create policy practices_update on public.practices
  for update to authenticated
  using (private.keystone_can(id, null, 'practice.manage'))
  with check (private.keystone_can(id, null, 'practice.manage'));

-- practice_members: practice members see the roster; a signed-in user
-- always sees their own row.
create policy practice_members_read on public.practice_members
  for select to authenticated
  using (private.is_practice_member(practice_id) or user_id = auth.uid());
create policy practice_members_write on public.practice_members
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'members.manage'));
create policy practice_members_update on public.practice_members
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'members.manage'))
  with check (private.keystone_can(practice_id, null, 'members.manage'));
create policy practice_members_delete on public.practice_members
  for delete to authenticated
  using (private.keystone_can(practice_id, null, 'members.manage'));

-- clients: practice members see every client; a client member sees only
-- their own client. THE CLIENT DIMENSION: is_member_of_client(id), never
-- practice-wide.
create policy clients_read on public.clients
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(id)
  );
create policy clients_write on public.clients
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'practice.manage'));
create policy clients_update on public.clients
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'practice.manage'))
  with check (private.keystone_can(practice_id, null, 'practice.manage'));

-- client_members: practice members see all rosters; a client member sees
-- their own client's roster (all four SafeSpace people see the same
-- picture, spec section 3) and never another client's.
create policy client_members_read on public.client_members
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
    or user_id = auth.uid()
  );
create policy client_members_write on public.client_members
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'members.manage'));
create policy client_members_update on public.client_members
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'members.manage'))
  with check (private.keystone_can(practice_id, null, 'members.manage'));
create policy client_members_delete on public.client_members
  for delete to authenticated
  using (private.keystone_can(practice_id, null, 'members.manage'));

-- engagements: the read predicate carries BOTH dimensions. A client
-- member of client A inside practice P must get zero rows for client B
-- inside the same practice P (spec section 9, the catastrophic leak).
create policy engagements_read on public.engagements
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy engagements_write on public.engagements
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy engagements_update on public.engagements
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));

-- workstreams and stage events: same two-dimension shape, on the
-- denormalized columns.
create policy workstreams_read on public.workstreams
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy workstreams_write on public.workstreams
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy workstreams_update on public.workstreams
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));

create policy stage_events_read on public.workstream_stage_events
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy stage_events_write on public.workstream_stage_events
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));

-- ---------------------------------------------------------------------
-- Platform tables (service-role only: RLS on, zero policies)
-- ---------------------------------------------------------------------

-- Sliding-window rate limiter store + atomic check (Trellis
-- 20260616_rate_limit_store.sql, copied with the table name kept).
create table if not exists public.rate_limit_hits (
  bucket  text        not null,
  hit_at  timestamptz not null default now()
);
create index if not exists rate_limit_hits_bucket_time_idx
  on public.rate_limit_hits (bucket, hit_at);
alter table public.rate_limit_hits enable row level security;

create or replace function public.rate_limit_check(
  p_keys       text[],
  p_windows_ms bigint[],
  p_maxes      int[]
) returns table(blocked_index int, retry_after_sec int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i          int;
  v_cutoff   timestamptz;
  v_count    int;
  v_earliest timestamptz;
begin
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    -- Serialize concurrent checks on the same bucket so two requests
    -- cannot both read count < max before either inserts.
    perform pg_advisory_xact_lock(hashtext(p_keys[i]));

    v_cutoff := now() - make_interval(secs => p_windows_ms[i] / 1000.0);

    delete from public.rate_limit_hits
      where bucket = p_keys[i] and hit_at <= v_cutoff;

    select count(*), min(hit_at)
      into v_count, v_earliest
      from public.rate_limit_hits
      where bucket = p_keys[i];

    if v_count >= p_maxes[i] then
      blocked_index   := i - 1;  -- 0-based for the JS caller
      retry_after_sec := greatest(
        1,
        ceil(extract(epoch from (
          v_earliest + make_interval(secs => p_windows_ms[i] / 1000.0) - now()
        )))::int
      );
      return next;
      return;
    end if;

    insert into public.rate_limit_hits(bucket) values (p_keys[i]);
  end loop;

  blocked_index   := -1;
  retry_after_sec := 0;
  return next;
end;
$$;

-- Only the service role may call it: Supabase default privileges grant
-- EXECUTE to anon/authenticated on new functions, so revoke explicitly.
revoke all on function public.rate_limit_check(text[], bigint[], int[]) from public, anon, authenticated;
do $$ begin
  grant execute on function public.rate_limit_check(text[], bigint[], int[]) to service_role;
exception when undefined_object then null; -- plain-Postgres CI has no service_role
end $$;

-- The AI cost ledger (spec 5.4): metadata only, never prompt or response
-- text. Service-role only.
create table if not exists public.ai_spend_ledger (
  id                    uuid primary key default gen_random_uuid(),
  practice_id           uuid not null references public.practices(id) on delete cascade,
  engagement_id         uuid references public.engagements(id) on delete set null,
  model                 text not null,
  tier                  text not null,
  task                  text,
  input_tokens          bigint not null default 0,
  output_tokens         bigint not null default 0,
  cache_read_tokens     bigint not null default 0,
  cache_creation_tokens bigint not null default 0,
  cost_usd              numeric(10,6) not null default 0,
  created_at            timestamptz not null default now()
);
create index if not exists ai_spend_ledger_practice_month_idx
  on public.ai_spend_ledger (practice_id, created_at desc);
alter table public.ai_spend_ledger enable row level security;

-- Month-to-date dollars for the spend gate. Called via the service role.
create or replace function public.keystone_ai_spend_mtd(p_practice_id uuid)
returns numeric
language sql stable
as $$
  select coalesce(sum(cost_usd), 0)
  from public.ai_spend_ledger
  where practice_id = p_practice_id
    and created_at >= date_trunc('month', now());
$$;
revoke all on function public.keystone_ai_spend_mtd(uuid) from public, anon, authenticated;
do $$ begin
  grant execute on function public.keystone_ai_spend_mtd(uuid) to service_role;
exception when undefined_object then null;
end $$;

-- Voice drift log: model output excerpts only, capped by the writer,
-- never the user's prompt and never transcript content. Service-role only.
create table if not exists public.voice_violations (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid references public.practices(id) on delete set null,
  source          text not null,
  violations      text[] not null default '{}',
  raw_excerpt     text,
  cleaned_excerpt text,
  retried         boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.voice_violations enable row level security;

-- Append-only audit: metadata (which fields, who, when), never values.
-- Service-role only.
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action      text not null,
  target      text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
alter table public.audit_log enable row level security;
