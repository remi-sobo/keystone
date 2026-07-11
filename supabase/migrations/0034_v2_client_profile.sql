-- V2 client profile (specs/keystone-v2-client-profiles.md), gate CP-3.
--
-- The org-level facts a profile is for and the flat list cannot hold,
-- added to the already-scoped clients table. Columns only; no policy
-- changes. The columns ride the wall that already stands: clients
-- updates through keystone_can(practice_id, null, 'practice.manage'),
-- so a consultant reads them but only an owner writes them, and a
-- client session can never resolve the reference because clients is
-- read practice-wide only through is_practice_member and the client
-- surface never selects these columns.
--
--   relationship_note        the practice's one-line why-this-client
--   primary_contact_member_id who to reach first, into the roster
--   website                  the org on the web
--   relationship_started_on  the relationship's start, distinct from
--                            created_at because a client may predate
--                            their Keystone record
--
-- No money enters here: the profile shows the engagement's own
-- fee_display (gate CP-2), never a stored total. Cross-venture revenue
-- stays a Trellis question.

alter table public.clients
  add column if not exists relationship_note text,
  add column if not exists primary_contact_member_id uuid
    references public.client_members(id) on delete set null,
  add column if not exists website text,
  add column if not exists relationship_started_on date;

create index if not exists clients_primary_contact_idx
  on public.clients (primary_contact_member_id);
