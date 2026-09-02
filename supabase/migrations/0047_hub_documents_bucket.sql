-- 0047: the hub documents bucket, and two donor columns the export
-- carries that 0046 missed (specs/epayl-fundraising-hub.md, phase two).
--
-- The bucket takes the homework-evidence discipline (0030): private,
-- path-scoped policies keyed to the caller's own membership, zero
-- service-role involvement. Paths are <org_id>/<uuid>-<filename>, so
-- the first folder segment is the whole wall: a hub member reads and
-- writes only under an org they belong to, through the same one
-- predicate as every hub table. Uploads land in hub_documents first
-- with parsed_at null, so a failed parse never loses the file.

-- The export's public-foundation pair (the private pair landed in 0046).
alter table public.hub_donors
  add column if not exists pub_foundation_name text,
  add column if not exists pub_foundation_assets_cents bigint;

insert into storage.buckets (id, name, public)
values ('hub-documents', 'hub-documents', false)
on conflict (id) do nothing;

drop policy if exists keystone_hub_documents_read on storage.objects;
create policy keystone_hub_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hub-documents'
    and private.is_hub_member(private.try_uuid((storage.foldername(name))[1]))
  );

drop policy if exists keystone_hub_documents_insert on storage.objects;
create policy keystone_hub_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hub-documents'
    and private.is_hub_member(private.try_uuid((storage.foldername(name))[1]))
  );

-- No update and no delete policy: the store is append-only to every
-- session, like the evidence bucket. Replacing a bad upload is a new
-- upload; removal is operator work.
