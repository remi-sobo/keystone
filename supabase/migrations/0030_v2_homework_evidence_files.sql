-- V2 3C follow-up (gate 3C-4): evidence files on the homework trail.
--
-- The loop proved itself; files now reuse the documents pattern: own
-- private bucket, path-scoped read policy, and the SAME coachee wall
-- as the trail (V2-4): the practice, or the coachee the parent item
-- is assigned to. A teammate or buyer can no more download the file
-- than read the row that carries it.
--
-- Path convention:
--   homework-evidence/<practice_id>/<client_id>/<engagement_id>/<action_item_id>/<uuid>/<file>
--
-- Uploads are the one storage-write policy in the system, because the
-- client surface is pure RLS and holds no service role: the coachee
-- inserts under their OWN open item's exact scope path, nothing else.
-- No update or delete policies anywhere: evidence is append-only like
-- the trail that carries it.

alter table public.homework_activity
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text;

-- The storage read policy joins on file_path.
create index if not exists homework_activity_file_path_idx
  on public.homework_activity (file_path);

insert into storage.buckets (id, name, public)
values ('homework-evidence', 'homework-evidence', false)
on conflict (id) do nothing;

create policy keystone_homework_evidence_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'homework-evidence'
    and (
      private.is_practice_member(private.try_uuid((storage.foldername(name))[1]))
      or exists (
        select 1
        from public.homework_activity ha
        join public.action_items ai on ai.id = ha.action_item_id
        where ha.file_path = name
          and private.owns_client_membership(ai.assigned_client_member_id)
      )
    )
  );

create policy keystone_homework_evidence_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'homework-evidence'
    and exists (
      select 1 from public.action_items ai
      where ai.id = private.try_uuid((storage.foldername(name))[4])
        and ai.practice_id = private.try_uuid((storage.foldername(name))[1])
        and ai.client_id = private.try_uuid((storage.foldername(name))[2])
        and ai.engagement_id = private.try_uuid((storage.foldername(name))[3])
        and ai.status = 'open'
        and ai.audience = 'client'
        and private.owns_client_membership(ai.assigned_client_member_id)
    )
  );
