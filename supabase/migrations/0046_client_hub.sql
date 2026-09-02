-- 0046: the Client Hub (specs/epayl-fundraising-hub.md), first instance
-- EPA Young Life at /epayl.
--
-- Keystone's first client-facing hub and its first client user. The
-- whole schema lands in this one migration with every correction from
-- the build prompt applied up front (docs/handoff/epayl/
-- KEYSTONE-CLIENT-HUB-BUILD-PROMPT.md, "Six corrections"), so nothing
-- gets built on the handoff shape and renamed later:
--
--   1. No Young Life vocabulary in the schema: hub_orgs / org_id, role
--      as plain text, vocabulary jsonb so EPA reads as "area" in the UI
--      without the database knowing what an area is.
--   2. hub_gifts.source (yl_export | manual): the parser's delete is
--      scoped to source = 'yl_export' and the org, so a manual gift
--      survives an export re-parse.
--   3. Do-not-contact is enforced, not annotated: a database trigger
--      refuses any task for a flagged household.
--   4. Every figure reconciles to one budget: hub_orgs carries NO goal
--      or cash column; everything computes from hub_budget_lines rows,
--      each carrying its trust level.
--   5. Export is a phase-two surface reading these same tables; nothing
--      here to prepare beyond honest scoping.
--   6. updated_by / updated_at on every human-edited table, set by
--      trigger on every write, so two people editing shared donor
--      records can see who changed what.
--
-- Scope: org_id everywhere, practice_id denormalized everywhere (the
-- repo's standing rule), membership resolved ONLY from the
-- authenticated user via private.is_hub_member. The hub is a
-- stranger-facing surface and takes the client-surface discipline:
-- pure RLS, no service role beneath src/app/(hub), and hub_orgs /
-- hub_members carry no member-write policies at all, so a hub session
-- can never widen its own access, invite anyone, or mint an org.

-- ---------------------------------------------------------------------
-- 1. Orgs and membership
-- ---------------------------------------------------------------------

create table if not exists public.hub_orgs (
  id                uuid primary key default gen_random_uuid(),
  practice_id       uuid not null references public.practices(id) on delete cascade,
  slug              text not null unique,
  name              text not null,
  fiscal_year_start date,
  -- The full token set: colors, font roles, per-org overrides. Resolved
  -- to CSS custom properties at the hub layout; components read
  -- variables only. The second client's hub is a row here, not a
  -- branch in the code.
  theme             jsonb not null default '{}',
  -- Per-org nouns and door copy. EPA reads as "area"; the schema never
  -- knows what an area is.
  vocabulary        jsonb not null default '{}',
  created_at        timestamptz not null default now()
);
create index if not exists hub_orgs_practice_idx on public.hub_orgs (practice_id);

create table if not exists public.hub_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  -- Email-keyed like every Keystone membership: user_id stays null
  -- until the verified JWT email claims the row on first sign-in.
  -- These rows ARE the allowlist; there is no env-var email list.
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  -- Role is plain text by decision (correction 1): the database holds
  -- no director/coach enum for one org's vocabulary.
  role        text not null default 'member',
  claimed_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists hub_members_email_uniq
  on public.hub_members (org_id, lower(email));
create index if not exists hub_members_user_idx on public.hub_members (user_id);

-- The one hub scope predicate. Every hub policy resolves through it,
-- so the wall has a single definition, like is_practice_member on the
-- delivery side.
create or replace function private.is_hub_member(p_org uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.hub_members
    where org_id = p_org
      and user_id = auth.uid()
      and revoked_at is null
  );
$$;
revoke all on function private.is_hub_member(uuid) from public, anon;
grant execute on function private.is_hub_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. People: donors and prospects (the export's real columns)
-- ---------------------------------------------------------------------

create table if not exists public.hub_donors (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id             uuid not null references public.practices(id) on delete cascade,
  household               text not null,
  greeting                text,
  city                    text,
  state                   text,
  zip                     text,
  email                   text,
  phone                   text,
  yl_account_number       text,
  iwave_score             int,
  capacity_5yr_cents      bigint,
  suggested_ask_cents     bigint,
  lifetime_cents          bigint,
  gift_count              int,
  real_estate_count       int,
  business                text,
  business_title          text,
  planned_giving_segment  text,
  insights_category       text,
  first_gift_date         date,
  first_gift_cents        bigint,
  last_gift_date          date,
  last_gift_cents         bigint,
  largest_gift_date       date,
  largest_gift_cents      bigint,
  foundation_name         text,
  foundation_assets_cents bigint,
  -- Contact flags from the export, enforced elsewhere (the hub_tasks
  -- trigger below, the stewardship rules, the appeal exclusions).
  -- Read-only in the v1 UI; the parser is their only writer.
  do_not_contact          boolean not null default false,
  receives_appeals        boolean not null default true,
  status                  text not null default 'prospect'
                          check (status in ('donor','prospect','archived')),
  source                  text not null default 'manual'
                          check (source in ('yl_export','manual')),
  notes                   text,
  updated_by              uuid,
  updated_at              timestamptz not null default now(),
  created_at              timestamptz not null default now()
);
create index if not exists hub_donors_org_idx on public.hub_donors (org_id);
-- The parser upserts on the YL account number inside one org.
create unique index if not exists hub_donors_account_uniq
  on public.hub_donors (org_id, yl_account_number)
  where yl_account_number is not null;

-- ---------------------------------------------------------------------
-- 3. Gifts (correction 2: manual gifts survive an export re-parse)
-- ---------------------------------------------------------------------

create table if not exists public.hub_gifts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id  uuid not null references public.practices(id) on delete cascade,
  donor_id     uuid not null references public.hub_donors(id) on delete cascade,
  -- One row per household per fiscal year is the export's grain; a
  -- manual gift is one row per gift. When a gift-level feed exists the
  -- table already fits it.
  fiscal_year  int not null,
  amount_cents bigint not null check (amount_cents >= 0),
  gift_date    date,
  designation  text,
  kind         text not null default 'cash' check (kind in ('cash','pledged')),
  strategy_id  uuid,
  -- THE column this table exists for: the parser's delete is scoped to
  -- source = 'yl_export' and the org, never wider, so what Kendra
  -- entered by hand survives every re-upload. Tested in the matrix and
  -- again in the parser suite.
  source       text not null check (source in ('yl_export','manual')),
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists hub_gifts_org_idx on public.hub_gifts (org_id);
create index if not exists hub_gifts_donor_idx on public.hub_gifts (donor_id);

-- ---------------------------------------------------------------------
-- 4. Strategies (the five PLAN cards; the IA revision's spine)
-- ---------------------------------------------------------------------

create table if not exists public.hub_strategies (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id    uuid not null references public.practices(id) on delete cascade,
  slug           text not null,
  name           text not null,
  owner          text,
  -- Goal is nullable ON PURPOSE: a figure that cannot be grounded
  -- renders as a gap with its trust level, never as a plausible value.
  goal_cents     bigint,
  goal_trust     text check (goal_trust in ('verified','estimated','stated','placeholder')),
  hours_per_week numeric,
  hours_trust    text check (hours_trust in ('verified','estimated','stated','placeholder')),
  -- The four things the method requires on every playbook.
  precondition   text,
  dependency     text,
  failure_mode   text,
  done_means     text,
  next_move      text,
  sort           int not null default 0,
  updated_by     uuid,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create unique index if not exists hub_strategies_slug_uniq
  on public.hub_strategies (org_id, slug);

-- ---------------------------------------------------------------------
-- 5. Tasks (correction 3 enforced here; correction 6 audit columns)
-- ---------------------------------------------------------------------

create table if not exists public.hub_tasks (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id      uuid not null references public.practices(id) on delete cascade,
  donor_id         uuid references public.hub_donors(id) on delete cascade,
  strategy_id      uuid references public.hub_strategies(id) on delete set null,
  title            text not null,
  -- The reason is always visible on the card: a suggestion without a
  -- reason is a demand.
  why              text,
  owner            text,
  due_date         date,
  done_at          timestamptz,
  -- Optional by decision: requiring a duration on every task means she
  -- stops entering tasks.
  estimate_minutes int,
  -- Kendra can pin her own move into any of the three HOME slots; a
  -- pin holds until she unpins it.
  pinned_slot      smallint check (pinned_slot between 1 and 3),
  source           text not null default 'manual'
                   check (source in ('manual','ai_suggested','stewardship_rule','gift_rule')),
  -- One firing per donor per rule per cycle: the rule engine writes a
  -- deterministic key and the unique index does the remembering.
  rule_key         text,
  updated_by       uuid,
  updated_at       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists hub_tasks_org_idx on public.hub_tasks (org_id);
create unique index if not exists hub_tasks_rule_once
  on public.hub_tasks (org_id, donor_id, rule_key)
  where rule_key is not null;
create unique index if not exists hub_tasks_pin_slot_uniq
  on public.hub_tasks (org_id, pinned_slot)
  where pinned_slot is not null;

-- Correction 3, the enforcement half: the task generator (and any
-- other writer) is refused at the database when the household is
-- flagged do-not-contact. Runs as the invoker, whose own RLS read on
-- hub_donors resolves the flag inside their org only.
create or replace function private.hub_tasks_refuse_do_not_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.donor_id is not null and exists (
    select 1 from public.hub_donors d
    where d.id = new.donor_id and d.do_not_contact
  ) then
    raise exception 'this household is flagged do not contact; no task may target it';
  end if;
  return new;
end;
$$;
drop trigger if exists hub_tasks_refuse_do_not_contact on public.hub_tasks;
create trigger hub_tasks_refuse_do_not_contact before insert or update on public.hub_tasks
  for each row execute function private.hub_tasks_refuse_do_not_contact();

-- ---------------------------------------------------------------------
-- 6. Research profiles (the ten sections, jsonb because the template
--    will change; the Dillabough profile is the schema reference)
-- ---------------------------------------------------------------------

create table if not exists public.hub_profiles (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id       uuid not null references public.practices(id) on delete cascade,
  donor_id          uuid not null references public.hub_donors(id) on delete cascade,
  stage             text,
  headline          text,
  snapshot          jsonb,
  public_notes      jsonb,
  capacity_ladder   jsonb,
  relationship_read jsonb,
  questions         jsonb,
  proposals         jsonb,
  sequence          jsonb,
  ask_path          jsonb,
  status            text not null default 'queued'
                    check (status in ('queued','drafting','complete')),
  generated_by      text not null default 'human' check (generated_by in ('ai','human')),
  reviewed_at       timestamptz,
  updated_by        uuid,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index if not exists hub_profiles_org_idx on public.hub_profiles (org_id);
create index if not exists hub_profiles_donor_idx on public.hub_profiles (donor_id);

-- ---------------------------------------------------------------------
-- 7. Budget lines (correction 4: the one source every figure
--    reconciles to; trust is not decoration)
-- ---------------------------------------------------------------------

create table if not exists public.hub_budget_lines (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id  uuid not null references public.practices(id) on delete cascade,
  fiscal_year  int not null,
  section      text not null,
  line         text not null,
  -- Nullable ON PURPOSE: a number that does not exist renders as a gap
  -- with its trust level, never as a plausible value.
  amount_cents bigint,
  trust        text not null
               check (trust in ('verified','estimated','stated','placeholder')),
  note         text,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists hub_budget_lines_org_idx on public.hub_budget_lines (org_id);

-- ---------------------------------------------------------------------
-- 8. Documents (a failed parse never loses the file)
-- ---------------------------------------------------------------------

create table if not exists public.hub_documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id  uuid not null references public.practices(id) on delete cascade,
  storage_path text not null,
  filename     text not null,
  kind         text not null
               check (kind in ('yl_export','budget','financial','research','notes','grant')),
  uploaded_by  uuid,
  parsed_at    timestamptz,
  parse_result jsonb,
  parse_error  text,
  created_at   timestamptz not null default now()
);
create index if not exists hub_documents_org_idx on public.hub_documents (org_id);

-- ---------------------------------------------------------------------
-- 9. Touches (what a donor has heard; what makes a reminder honest)
-- ---------------------------------------------------------------------

create table if not exists public.hub_touches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  donor_id    uuid not null references public.hub_donors(id) on delete cascade,
  kind        text not null
              check (kind in ('thank_you','call','meeting','report','note','event')),
  occurred_on date not null,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists hub_touches_org_idx on public.hub_touches (org_id);
create index if not exists hub_touches_donor_idx on public.hub_touches (donor_id);

-- ---------------------------------------------------------------------
-- 10. Content blocks (the plan's own words: a row update, not a deploy)
-- ---------------------------------------------------------------------

create table if not exists public.hub_content_blocks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  section     text not null,
  strategy_id uuid references public.hub_strategies(id) on delete cascade,
  kind        text not null
              check (kind in ('headline','lead','paragraph','table','stat_row')),
  payload     jsonb not null default '{}',
  sort        int not null default 0,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists hub_content_blocks_org_idx
  on public.hub_content_blocks (org_id, section, sort);

-- ---------------------------------------------------------------------
-- 11. Collateral (WORK's blockers: things stopping other things)
-- ---------------------------------------------------------------------

create table if not exists public.hub_collateral (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  name        text not null,
  owner       text,
  due_date    date,
  status      text not null default 'missing'
              check (status in ('exists','in_progress','missing')),
  blocks      text,
  sort        int not null default 0,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists hub_collateral_org_idx on public.hub_collateral (org_id);

-- ---------------------------------------------------------------------
-- 12. Capacity (hours available per person; the number that decides
--     whether the rest gets executed)
-- ---------------------------------------------------------------------

create table if not exists public.hub_capacity (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.hub_orgs(id) on delete cascade,
  practice_id    uuid not null references public.practices(id) on delete cascade,
  person         text not null,
  hours_per_week numeric,
  trust          text check (trust in ('verified','estimated','stated','placeholder')),
  note           text,
  sort           int not null default 0,
  updated_by     uuid,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists hub_capacity_org_idx on public.hub_capacity (org_id);

-- ---------------------------------------------------------------------
-- 13. Audit trigger (correction 6): who changed what, on every write
-- ---------------------------------------------------------------------

create or replace function private.hub_touch_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Null under the seed/operator path; always the session user in app
  -- writes, since the hub surface is pure RLS.
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists hub_donors_audit on public.hub_donors;
create trigger hub_donors_audit before insert or update on public.hub_donors
  for each row execute function private.hub_touch_audit();
drop trigger if exists hub_tasks_audit on public.hub_tasks;
create trigger hub_tasks_audit before insert or update on public.hub_tasks
  for each row execute function private.hub_touch_audit();
drop trigger if exists hub_profiles_audit on public.hub_profiles;
create trigger hub_profiles_audit before insert or update on public.hub_profiles
  for each row execute function private.hub_touch_audit();
drop trigger if exists hub_strategies_audit on public.hub_strategies;
create trigger hub_strategies_audit before insert or update on public.hub_strategies
  for each row execute function private.hub_touch_audit();
drop trigger if exists hub_collateral_audit on public.hub_collateral;
create trigger hub_collateral_audit before insert or update on public.hub_collateral
  for each row execute function private.hub_touch_audit();
drop trigger if exists hub_capacity_audit on public.hub_capacity;
create trigger hub_capacity_audit before insert or update on public.hub_capacity
  for each row execute function private.hub_touch_audit();
drop trigger if exists hub_content_blocks_audit on public.hub_content_blocks;
create trigger hub_content_blocks_audit before insert or update on public.hub_content_blocks
  for each row execute function private.hub_touch_audit();

-- ---------------------------------------------------------------------
-- 14. RLS: one predicate, every table
-- ---------------------------------------------------------------------

alter table public.hub_orgs           enable row level security;
alter table public.hub_members        enable row level security;
alter table public.hub_donors         enable row level security;
alter table public.hub_gifts          enable row level security;
alter table public.hub_profiles       enable row level security;
alter table public.hub_tasks          enable row level security;
alter table public.hub_strategies     enable row level security;
alter table public.hub_budget_lines   enable row level security;
alter table public.hub_documents      enable row level security;
alter table public.hub_touches        enable row level security;
alter table public.hub_content_blocks enable row level security;
alter table public.hub_collateral     enable row level security;
alter table public.hub_capacity       enable row level security;

-- Org identity and membership: SELECT only. A hub session sees its own
-- org's row and roster (updated_by needs a name) and can never write
-- either table: no insert, update, or delete policy exists, so the
-- session cannot mint an org, invite anyone, retheme, or enumerate
-- other orgs, their count, or their names.
create policy hub_orgs_member_read on public.hub_orgs
  for select to authenticated using (private.is_hub_member(id));
create policy hub_members_member_read on public.hub_members
  for select to authenticated using (private.is_hub_member(org_id));

-- Working tables: full member CRUD inside the member's own org only.
create policy hub_donors_member on public.hub_donors
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_gifts_member on public.hub_gifts
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_profiles_member on public.hub_profiles
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_tasks_member on public.hub_tasks
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_strategies_member on public.hub_strategies
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_budget_lines_member on public.hub_budget_lines
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_documents_member on public.hub_documents
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_touches_member on public.hub_touches
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_content_blocks_member on public.hub_content_blocks
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_collateral_member on public.hub_collateral
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));
create policy hub_capacity_member on public.hub_capacity
  for all to authenticated using (private.is_hub_member(org_id))
  with check (private.is_hub_member(org_id));

-- ---------------------------------------------------------------------
-- 15. The claim path, restated to include hub membership
-- ---------------------------------------------------------------------

-- Same contract as 0009: the verified JWT email claims LIVE pending
-- rows only; a revoked row can never be re-claimed by signing in again.
create or replace function public.keystone_claim_membership()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.practice_members
    set user_id = auth.uid(), claimed_at = now()
    where user_id is null
      and revoked_at is null
      and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''));
  update public.client_members
    set user_id = auth.uid(), claimed_at = now()
    where user_id is null
      and revoked_at is null
      and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''));
  update public.hub_members
    set user_id = auth.uid(), claimed_at = now()
    where user_id is null
      and revoked_at is null
      and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''));
end;
$$;
revoke all on function public.keystone_claim_membership() from public, anon;
grant execute on function public.keystone_claim_membership() to authenticated;

-- ---------------------------------------------------------------------
-- 16. The door (the one deliberate pre-auth disclosure, SECURITY.md)
-- ---------------------------------------------------------------------

-- The locked screen has to say what it is and wear the org's own
-- system before any session exists, and the anon role reads no table
-- anywhere. This definer RPC is the entire pre-auth surface:
-- presentation only (name, theme, door copy), one org per known slug,
-- nothing for an unknown one. No figure, no member, no donor anything
-- lives in these columns.
create or replace function public.keystone_hub_door(p_slug text)
returns table (name text, theme jsonb, vocabulary jsonb)
language sql security definer stable
set search_path = ''
as $$
  select o.name, o.theme, o.vocabulary
  from public.hub_orgs o
  where o.slug = p_slug;
$$;
revoke all on function public.keystone_hub_door(text) from public;
grant execute on function public.keystone_hub_door(text) to anon, authenticated;
