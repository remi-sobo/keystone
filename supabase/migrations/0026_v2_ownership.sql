-- V2 4C: consultant ownership (specs/keystone-v2-workload.md).
--
-- Who owns what, made explicit: an owner per engagement and per
-- workstream, both practice members. Columns only; no policy changes.
-- The columns ride the walls that already stand: engagements and
-- workstreams update through keystone_can, and a client session can
-- never resolve the owner reference because practice_members reads
-- practice-side only. Ownership is descriptive (who to ask), never a
-- workload score; the /team view renders it as lists, not numbers per
-- head.

alter table public.engagements
  add column if not exists owner_practice_member_id uuid
    references public.practice_members(id) on delete set null;

alter table public.workstreams
  add column if not exists owner_practice_member_id uuid
    references public.practice_members(id) on delete set null;

create index if not exists engagements_owner_idx
  on public.engagements (owner_practice_member_id);
create index if not exists workstreams_owner_idx
  on public.workstreams (owner_practice_member_id);
