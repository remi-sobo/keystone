-- Lead intake staging (specs/website-to-keystone-lead-intake.md, commit 2).
--
-- soboconsulting.com posts a contact submission here. That is the whole
-- surface: one narrow endpoint, one insert, one table nobody reads
-- directly. The site never touches Keystone's real tables, because the
-- public marketing site is the more exposed of the two and a compromise
-- there must not become a compromise of client delivery data.
--
-- THE MIRROR IS NEVER TRUTH. A staging row is a copy of something the
-- site already recorded durably in its own contact_submissions table.
-- Nothing downstream may treat a row here as a prospect, a client, or a
-- person Keystone knows. Promotion into the spine is a separate, human
-- act (commit 3), and it does not exist yet.
--
-- DENY-ALL, the operator-ledger pattern already used by google_connections,
-- ai_spend_ledger, voice_violations, qa_exchanges, and calendar_busy: RLS
-- on with ZERO policies, so every authenticated session reads zero rows
-- and writes none. The service role behind the intake route is the only
-- writer. Recorded in SECURITY.md section 5. The isolation matrix proves
-- the wall in supabase/tests/isolation-seed.sql and the gate spec is
-- e2e/lead-intake-isolation.spec.ts, both in this same commit.
--
-- Why deny-all rather than a membership policy: until a human routes a
-- lead, nobody is entitled to it. Most submissions are not sales leads at
-- all (families, schools, existing clients, vendors all use one form), so
-- an untriaged row is exactly the thing that must not be reachable. The
-- privacy wall is the default, not a filter applied later.

-- ---------------------------------------------------------------------
-- Org-name normalization (failure mode 4 in the spec)
-- ---------------------------------------------------------------------
--
-- "SafeSpace", "Safe Space Center", and "SafeSpace Center, Inc." are one
-- organization typed three ways, and all three defeat a raw string match.
-- The collision check that commit 3 will run keys on the normalized form;
-- every surface shows the original the person typed.
--
-- Lowercase, punctuation to spaces, drop a leading article, strip common
-- legal and category suffixes repeatedly (so "center, inc." loses both),
-- then remove whitespace entirely, which is what makes "Safe Space" and
-- "SafeSpace" land on the same key.
--
-- IMMUTABLE because a generated column requires it: same input, same
-- output, forever. Changing this function later does NOT rewrite existing
-- generated values, so a change needs a backfill migration alongside it.

create or replace function private.keystone_normalize_org(raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
  prev text;
  i int := 0;
begin
  if raw is null then
    return null;
  end if;

  -- Lowercase, punctuation and symbols to single spaces, collapse runs.
  s := regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));

  -- A leading article is never distinguishing.
  s := regexp_replace(s, '^the ', '');

  -- Strip trailing noise words one at a time until nothing changes.
  -- Bounded so a pathological input cannot spin: six passes is far more
  -- suffixes than any real organization name carries.
  loop
    i := i + 1;
    prev := s;
    s := btrim(regexp_replace(
      s,
      '\s(inc|incorporated|llc|llp|ltd|limited|corp|corporation|co|company|'
      || 'foundation|fdn|fund|trust|org|organization|organisation|'
      || 'center|centre|centers|centres|group|institute|institution|'
      || 'association|society|network|project|initiative|alliance|'
      || 'services|service|solutions|partners|nonprofit|npo)$',
      ''
    ));
    exit when s = prev or i >= 6;
  end loop;

  -- Whitespace carries no signal once we are down to the distinguishing
  -- words: this is what collapses "Safe Space" onto "SafeSpace".
  s := regexp_replace(s, '\s+', '', 'g');

  return nullif(s, '');
end;
$$;

-- ---------------------------------------------------------------------
-- sales_intake_staging
-- ---------------------------------------------------------------------

create table if not exists public.sales_intake_staging (
  id                      uuid primary key default gen_random_uuid(),

  -- The tenant this inbound belongs to. Resolved server-side in the route
  -- from INTAKE_PRACTICE_ID, NEVER from the request body, the same rule
  -- the browser-facing surfaces follow. A leaked intake secret therefore
  -- cannot write into another practice's queue.
  practice_id             uuid not null references public.practices(id) on delete cascade,

  -- The site's own contact_submissions.id. The idempotency key: replaying
  -- the same POST inserts once and reports success every time.
  external_submission_id  uuid not null,

  -- What the person typed, kept verbatim for every human surface.
  org_name                text not null,
  contact_name            text not null,
  email                   text not null,
  audience                text,
  role                    text,
  budget_band             text,
  message                 text,

  -- Attribution, carried end to end. Nothing reads these for months.
  source_page             text,
  utm                     jsonb,

  -- When the person actually submitted, per the site. Distinct from
  -- received_at, which is when Keystone heard about it; a reconciled
  -- forward can arrive days after the submission it describes.
  submitted_at            timestamptz,
  received_at             timestamptz not null default now(),

  -- The collision key. Generated, so no writer can forget it and no two
  -- call sites can normalize differently.
  org_name_normalized     text generated always as
                          (private.keystone_normalize_org(org_name)) stored
);

-- Idempotency, enforced by the database rather than by the route's care.
-- Scoped by practice so a second site feeding a second tenant later
-- cannot collide on an id that means nothing across tenants.
create unique index if not exists sales_intake_staging_external_idx
  on public.sales_intake_staging (practice_id, external_submission_id);

-- The triage queue's read (commit 3) and the collision check's lookup.
create index if not exists sales_intake_staging_practice_idx
  on public.sales_intake_staging (practice_id, received_at desc);
create index if not exists sales_intake_staging_org_idx
  on public.sales_intake_staging (practice_id, org_name_normalized);

alter table public.sales_intake_staging enable row level security;

-- No policies, on purpose. Not an oversight, and not a table waiting for
-- its policy: deny-all IS the enforcement here. Commit 3 reads this table
-- through the service role after a practice-membership check, the
-- practice-surface pattern from specs/keystone.md section 5. Adding a
-- member-readable policy would put untriaged inbound in front of people
-- who are not entitled to it, which is the exact hole this table exists
-- to avoid.
