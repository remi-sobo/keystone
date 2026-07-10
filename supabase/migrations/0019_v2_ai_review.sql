-- V2 3A: the editable AI proposal review (specs/keystone-v2-ai-review.md).
--
-- Law one: the original is never lost. The AI's payload becomes
-- structurally immutable the moment it lands; a trigger rejects any
-- UPDATE that changes it, for EVERY writer including the service role
-- (triggers do not care about RLS). Human edits live in
-- edited_payload, a separate copy, so "what the AI said" versus "what
-- you published" is recoverable forever.
--
-- The audience wall this spec originally carried shipped with 3C
-- (migration 0017, gate 3C-5); this migration is the ai_proposals
-- deltas alone.

alter table public.ai_proposals
  add column if not exists edited_payload jsonb,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id) on delete set null;

create or replace function private.ai_proposals_payload_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payload is distinct from old.payload then
    raise exception 'ai_proposals.payload is immutable; edits belong in edited_payload';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_proposals_payload_immutable on public.ai_proposals;
create trigger ai_proposals_payload_immutable
  before update on public.ai_proposals
  for each row execute function private.ai_proposals_payload_immutable();
