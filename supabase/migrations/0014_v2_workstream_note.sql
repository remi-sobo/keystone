-- V2 2F: the "why we're here" note
-- (specs/keystone-v2-workstream-detail.md). Two columns, no new table,
-- no RLS change: workstreams carries both walls since Ring 1, its
-- write policy (engagement.write) already keeps client members out,
-- and the note is client-visible on save by design. This column is
-- also the landing site for 3A's propose-then-accept note drafting:
-- only the practice can write here, so AI output reaches it through a
-- human hand or not at all.

alter table public.workstreams
  add column if not exists note_md text,
  add column if not exists note_updated_at timestamptz;
