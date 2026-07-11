-- V2 4H: the practice knowledge base container
-- (specs/keystone-v2-knowledge-base.md).
--
-- The library's two jobs split cleanly (the 3F decision, completed
-- here): client-visible resources are the client learning path;
-- practice-only resources are the beginning of the knowledge base.
-- Same table, one new wall: an audience column, defaulting 'client'
-- so every existing row keeps meaning exactly what it meant, and the
-- read policy narrowed so a client session reads client-audience rows
-- only. The homework audience pattern, applied to the catalog.
--
-- The kind list grows the knowledge-base shapes. Container only:
-- SOBO's canonical playbooks stay in Trellis until Remi decides
-- otherwise (the spec's standing question, not this migration's).

alter table public.resources
  add column if not exists audience text not null default 'client'
    check (audience in ('client','practice'));

alter table public.resources drop constraint if exists resources_kind_check;
alter table public.resources add constraint resources_kind_check
  check (kind in ('guide','framework','template',
                  'sop','agenda_template','homework_template',
                  'deliverable_template','prompt_recipe','diagnostic'));

drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or (audience = 'client' and private.is_client_member_of_practice(practice_id))
  );
