-- Client Agreement Document (docs/keystone-agreement-adaptations in
-- CURRENT.md; source spec: the client-agreement-doc spec, adjusted to
-- the real Ring 1 schema per its CONFIRM-1).
--
-- A private per-engagement document store for formal documents,
-- starting with the executed agreement. The operator uploads and
-- decides when the client sees it (visible_to_client, default false:
-- nothing reaches the client until deliberately shared). The client
-- reads only shared rows of their own client, pure RLS, and downloads
-- through their own session like deliverables (Ring 4 pattern); no
-- service role ever runs on the client path.
--
-- Adjustments from the source spec, all listed in CURRENT.md:
--   - client_id is carried and denormalized (Keystone law; the spec's
--     table lacked it and leaned on a nonexistent engagement_members).
--   - Client reads ride is_member_of_client, not engagement_members.
--   - No storage write policies: uploads ride signed upload URLs
--     minted server-side after the membership check, deletes ride the
--     service role behind the same check (the 0006 contract).

create table if not exists public.engagement_documents (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  doc_type      text not null default 'agreement',
  title         text not null,
  status        text not null default 'uploaded' check (status in ('uploaded','signed')),
  storage_path  text not null,
  file_name     text not null,
  file_size     bigint,
  mime_type     text not null default 'application/pdf',
  -- Premature-exposure guard: false until the operator flips it.
  visible_to_client boolean not null default false,
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists engagement_documents_engagement_idx
  on public.engagement_documents (engagement_id, created_at desc);
create index if not exists engagement_documents_practice_idx
  on public.engagement_documents (practice_id);
-- The storage read policy joins on storage_path.
create index if not exists engagement_documents_path_idx
  on public.engagement_documents (storage_path);

alter table public.engagement_documents enable row level security;

-- The practice reads everything of its own; a client member reads ONLY
-- shared rows of their own client. Both predicates are the hardened
-- 0009 versions, so revocation closes this wall with the others.
create policy engagement_documents_read on public.engagement_documents
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or (visible_to_client and private.is_member_of_client(client_id))
  );
create policy engagement_documents_insert on public.engagement_documents
  for insert to authenticated
  with check (private.is_practice_member(practice_id));
create policy engagement_documents_update on public.engagement_documents
  for update to authenticated
  using (private.is_practice_member(practice_id))
  with check (private.is_practice_member(practice_id));
create policy engagement_documents_delete on public.engagement_documents
  for delete to authenticated
  using (private.is_practice_member(practice_id));

-- ---------------------------------------------------------------------
-- Storage: one private bucket, read policies only (0006 contract)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('engagement-documents', 'engagement-documents', false)
on conflict (id) do nothing;

-- engagement-documents/<practice_id>/<client_id>/<engagement_id>/<uuid>/<file>
-- The practice reads its own tree by path. A client member reads an
-- object ONLY through its row: the subquery demands a visible row of
-- their own client pointing at exactly this object, so an unshared
-- file is unreadable even with a known path.
create policy keystone_engagement_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'engagement-documents'
    and (
      private.is_practice_member(private.try_uuid((storage.foldername(name))[1]))
      or exists (
        select 1 from public.engagement_documents d
        where d.storage_path = name
          and d.visible_to_client
          and private.is_member_of_client(d.client_id)
      )
    )
  );
