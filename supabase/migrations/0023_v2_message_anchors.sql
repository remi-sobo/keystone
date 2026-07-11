-- V2 3E: contextual message anchors (specs/keystone-v2-anchors.md).
--
-- One thread per engagement stays the law; a message may now carry
-- its context: an anchor type, an id resolved inside the engagement
-- scope by the send action, and a label derived SERVER-SIDE so the
-- chip renders without joins and survives artifact deletion honestly.
-- The 0007 column grant already limits every session UPDATE on
-- messages to read_at, so these columns are sealed at send the same
-- way the body is: no new grant, no new policy, nothing to drift.

alter table public.messages
  add column if not exists anchor_type text
    check (anchor_type in ('session','action_item','deliverable','workstream','decision')),
  add column if not exists anchor_id uuid,
  add column if not exists anchor_label text;

alter table public.messages
  add constraint messages_anchor_whole
  check (
    ((anchor_type is null) = (anchor_id is null))
    and ((anchor_type is null) = (anchor_label is null))
  );
