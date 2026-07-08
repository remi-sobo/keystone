-- Ring 4: deliverables and the resource library (specs/keystone.md
-- section 5.1, ring plan section 10).
--
-- Three tables and two private storage buckets:
--
--   deliverables            every artifact the practice ships, uploaded
--                           or linked, organized by workstream, with a
--                           delivery date. Client-visible by design:
--                           this is the surface the fee lives on.
--   resources               the practice's reference catalog (guides,
--                           frameworks, templates). Practice-scoped, NO
--                           client_id on purpose: readable by every
--                           client member of that practice, writable by
--                           its consultants only (spec 5.1).
--   session_prep_resources  the join that surfaces a resource as prep
--                           for a specific session (spec 6.4 "prep
--                           resources surfaced above upcoming
--                           sessions"). FLAGGED spec addition: the
--                           schema block in spec 5.1 names the surface
--                           but not the join table; this is the minimal
--                           mechanism, logged in the build log.
--
-- Storage: buckets 'deliverables' and 'resources', both private.
-- Object paths carry the scope ids as folders so the storage policies
-- can enforce the same walls as the tables:
--   deliverables/<practice_id>/<client_id>/<engagement_id>/<uuid>/<file>
--   resources/<practice_id>/<uuid>/<file>
-- Reads ride path-scoped SELECT policies (the pure-RLS client surface
-- downloads with its own session). There are NO insert, update, or
-- delete policies on either bucket: uploads ride signed upload URLs
-- minted server-side after the membership check, deletes ride the
-- service role behind the same check.

-- ---------------------------------------------------------------------
-- deliverables
-- ---------------------------------------------------------------------

create table if not exists public.deliverables (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  workstream_id uuid references public.workstreams(id) on delete set null,
  title         text not null,
  kind          text not null check (kind in ('file','link')),
  storage_path  text,
  url           text,
  note          text,
  delivered_on  date not null default current_date,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- A file deliverable carries its object path; a link carries its url.
  constraint deliverables_kind_payload check (
    (kind = 'file' and storage_path is not null)
    or (kind = 'link' and url is not null)
  )
);
create index if not exists deliverables_client_idx
  on public.deliverables (client_id, delivered_on desc);
create index if not exists deliverables_engagement_idx
  on public.deliverables (engagement_id, delivered_on desc);

-- ---------------------------------------------------------------------
-- resources (practice-scoped reference; the documented no-client_id case)
-- ---------------------------------------------------------------------

create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references public.practices(id) on delete cascade,
  title        text not null,
  kind         text not null default 'guide'
               check (kind in ('guide','framework','template')),
  body_md      text,
  storage_path text,
  tags         text[] not null default '{}',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists resources_practice_idx
  on public.resources (practice_id, created_at desc);

-- ---------------------------------------------------------------------
-- session_prep_resources (surfacing join; flagged spec addition)
-- ---------------------------------------------------------------------

create table if not exists public.session_prep_resources (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (session_id, resource_id)
);
create index if not exists session_prep_session_idx
  on public.session_prep_resources (session_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.deliverables enable row level security;
alter table public.resources enable row level security;
alter table public.session_prep_resources enable row level security;

-- deliverables: the practice reads and writes; a client member reads
-- only their own client's artifacts. The client never writes: the
-- practice ships, the client watches the fee become real.
create policy deliverables_read on public.deliverables
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy deliverables_insert on public.deliverables
  for insert to authenticated
  with check (private.is_practice_member(practice_id));
create policy deliverables_update on public.deliverables
  for update to authenticated
  using (private.is_practice_member(practice_id))
  with check (private.is_practice_member(practice_id));
create policy deliverables_delete on public.deliverables
  for delete to authenticated
  using (private.is_practice_member(practice_id));

-- resources: readable by the practice and by EVERY client member of
-- that practice (the catalog is practice-wide IP, spec 5.1); writable
-- by practice members only.
create policy resources_read on public.resources
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_client_member_of_practice(practice_id)
  );
create policy resources_insert on public.resources
  for insert to authenticated
  with check (private.is_practice_member(practice_id));
create policy resources_update on public.resources
  for update to authenticated
  using (private.is_practice_member(practice_id))
  with check (private.is_practice_member(practice_id));
create policy resources_delete on public.resources
  for delete to authenticated
  using (private.is_practice_member(practice_id));

-- session_prep_resources: the practice manages, the session's client
-- reads (prep for THEIR session only; another client of the same
-- practice never sees which resources a sibling engagement was handed).
create policy session_prep_read on public.session_prep_resources
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );
create policy session_prep_insert on public.session_prep_resources
  for insert to authenticated
  with check (private.is_practice_member(practice_id));
create policy session_prep_delete on public.session_prep_resources
  for delete to authenticated
  using (private.is_practice_member(practice_id));

-- ---------------------------------------------------------------------
-- Storage: private buckets, path-scoped read policies
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('deliverables', 'deliverables', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('resources', 'resources', false)
on conflict (id) do nothing;

-- A path segment that fails to parse as a uuid must read as "no scope"
-- (policy false), never as a query error that could surface rows.
create or replace function private.try_uuid(p text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then p::uuid
  end
$$;
revoke all on function private.try_uuid(text) from public, anon;
grant execute on function private.try_uuid(text) to authenticated, service_role;

-- deliverables/<practice_id>/<client_id>/...: the practice reads its
-- own tree, a client member reads only their client's folder.
create policy keystone_deliverables_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deliverables'
    and (
      private.is_practice_member(private.try_uuid((storage.foldername(name))[1]))
      or private.is_member_of_client(private.try_uuid((storage.foldername(name))[2]))
    )
  );

-- resources/<practice_id>/...: the practice and all its client members.
create policy keystone_resources_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resources'
    and (
      private.is_practice_member(private.try_uuid((storage.foldername(name))[1]))
      or private.is_client_member_of_practice(private.try_uuid((storage.foldername(name))[1]))
    )
  );
