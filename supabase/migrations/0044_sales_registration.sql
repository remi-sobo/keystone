-- Sales Ring 1: registration and the wall (specs/keystone-sales.md).
--
-- The sales lead is a contractor. He sells the practice's offers and he
-- must never see the practice's delivery: no engagement, no session, no
-- note, no client, no deliverable, no message, no finance row. The spec
-- calls this the privacy wall and it is the reason this ring exists
-- before any board or qualification card.
--
-- THE WALL IS ONE PREDICATE. Every read policy in the schema, and every
-- storage policy, resolves practice-side visibility through
-- private.is_practice_member. Redefining that one function to mean
-- "a DELIVERY-side practice member" walls the entire existing system
-- from the new role in a single place, mechanically, instead of adding
-- a role check to ninety policies and hoping none was missed. The new
-- role reaches the sales tables through its own predicate
-- (private.is_sales_lead) and its own permissions, and nothing else.
--
-- What this ring builds:
--   the sales_lead role and the wall
--   house_accounts, seeded from Exhibit A of the agreement (empty here,
--     see supabase/seed-house-accounts.sql and the FLAG in CURRENT.md)
--   sales_prospects, the registration timestamp record
--   the collision guard: a house account or an existing client of the
--     practice is refused AT INSERT, in the database, not in a form
--   keystone_sales_registration_check, the live check the form calls,
--     minimal disclosure (a verdict, never the list)
--
-- Money is Ring 4 (0045). Stage, next step, and the six qualification
-- fields are Rings 2 and 3, deferred by the spec until cohort one is
-- half sold.

-- ---------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------

alter table public.practice_members
  drop constraint if exists practice_members_role_check;
alter table public.practice_members
  add constraint practice_members_role_check
  check (role in ('owner', 'consultant', 'sales_lead'));

-- ---------------------------------------------------------------------
-- 2. The wall, in one predicate
-- ---------------------------------------------------------------------

-- is_practice_member now means DELIVERY-side practice member. Every
-- policy that already calls it (engagements, sessions, notes, homework,
-- deliverables, resources, messages, digests, the storage buckets, the
-- client profile) therefore returns zero rows for a sales lead, with no
-- edit to any of those policies. Restated from 0009 with the role
-- exclusion added; revoked_at handling is unchanged.
create or replace function private.is_practice_member(p_practice uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.practice_members
    where user_id = auth.uid() and practice_id = p_practice and user_id is not null
      and revoked_at is null
      and role <> 'sales_lead'
  );
$$;

-- The sales lead's own predicate. Deliberately NOT named
-- is_practice_member_anything: the two populations never share a
-- predicate, so a future policy cannot admit the wrong one by reflex.
create or replace function private.is_sales_lead(p_practice uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.practice_members
    where user_id = auth.uid() and practice_id = p_practice and user_id is not null
      and revoked_at is null
      and role = 'sales_lead'
  );
$$;
revoke all on function private.is_sales_lead(uuid) from public, anon;
grant execute on function private.is_sales_lead(uuid) to authenticated;

-- Permissions are data, not policy rewrites (0001). The sales lead gets
-- sales.register and NOTHING else, so keystone_can answers false for
-- engagement.read, engagement.write, members.manage, and practice.manage
-- everywhere those policies are consulted.
insert into public.role_permissions (role, permission) values
  ('owner',      'sales.manage'),
  ('sales_lead', 'sales.register')
on conflict do nothing;

-- The practice shell needs the practice's own name to render for the
-- sales lead. This is the ONE existing table the role can read, and it
-- carries a name and a slug, no client and no money.
drop policy if exists practices_read on public.practices;
create policy practices_read on public.practices
  for select to authenticated
  using (
    private.is_practice_member(id)
    or private.is_client_member_of_practice(id)
    or private.is_sales_lead(id)
  );

-- ---------------------------------------------------------------------
-- 3. Org-name normalization (the collision key)
-- ---------------------------------------------------------------------

-- Immutable so it can back a generated column. Errs toward COLLIDING:
-- a false collision blocks a registration and Remi can clear it, a
-- missed collision hands a house account to a contractor. Fail toward
-- the recoverable side.
create or replace function private.keystone_norm_org(p_name text)
returns text
language sql immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_name, ''))), '^the\s+', ''),
      '[\s,\.]*(incorporated|inc|llc|l\.l\.c|ltd|limited|corp|corporation|company|co)\.?$', ''
    ),
    '[^a-z0-9]', '', 'g'
  );
$$;
revoke all on function private.keystone_norm_org(text) from public, anon;
grant execute on function private.keystone_norm_org(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. house_accounts (Exhibit A of the agreement)
-- ---------------------------------------------------------------------

create table if not exists public.house_accounts (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references public.practices(id) on delete cascade,
  org_name      text not null check (btrim(org_name) <> ''),
  org_name_norm text generated always as (private.keystone_norm_org(org_name)) stored,
  note          text,
  added_by      uuid references auth.users(id) on delete set null,
  added_at      timestamptz not null default now()
);
create unique index if not exists house_accounts_org_uniq
  on public.house_accounts (practice_id, org_name_norm);

alter table public.house_accounts enable row level security;

-- Delivery-side only. The sales lead never reads this table: he gets a
-- verdict on the org he typed, never the list (minimal disclosure, the
-- keystone_message_notify_targets pattern). The list is the exhibit to
-- his own contract, so he is entitled to it on paper; he is not
-- entitled to a live export of who the practice is talking to.
create policy house_accounts_read on public.house_accounts
  for select to authenticated
  using (private.is_practice_member(practice_id));
create policy house_accounts_insert on public.house_accounts
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'practice.manage'));
create policy house_accounts_update on public.house_accounts
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'practice.manage'))
  with check (private.keystone_can(practice_id, null, 'practice.manage'));
create policy house_accounts_delete on public.house_accounts
  for delete to authenticated
  using (private.keystone_can(practice_id, null, 'practice.manage'));

-- ---------------------------------------------------------------------
-- 5. sales_prospects (the registration record)
-- ---------------------------------------------------------------------

create table if not exists public.sales_prospects (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references public.practices(id) on delete cascade,
  org_name      text not null check (btrim(org_name) <> ''),
  org_name_norm text generated always as (private.keystone_norm_org(org_name)) stored,
  contact_name  text,
  contact_email text,
  source        text,
  note          text,
  -- The clause the whole ring exists for: whose prospect this is, and
  -- from when. on delete restrict, because deleting the auth user must
  -- not quietly orphan a registration that settles a disagreement.
  registered_by uuid not null references auth.users(id) on delete restrict,
  registered_at timestamptz not null default now(),
  -- 180 days, per the agreement's registration term.
  expires_at    timestamptz not null default now() + interval '180 days',
  status        text not null default 'registered'
                check (status in ('registered', 'expired', 'released', 'converted')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One LIVE registration per org per practice. Partial on status, so a
-- lapsed registration stops blocking without the record being deleted:
-- the row stays, the claim does not. The guard below expires lapsed
-- rows on the way in, which is what keeps this index honest with no
-- cron to forget.
create unique index if not exists sales_prospects_active_org_uniq
  on public.sales_prospects (practice_id, org_name_norm)
  where status = 'registered';
create index if not exists sales_prospects_owner_idx
  on public.sales_prospects (practice_id, registered_by, registered_at desc);
create index if not exists sales_prospects_expiry_idx
  on public.sales_prospects (practice_id, expires_at)
  where status = 'registered';

alter table public.sales_prospects enable row level security;

-- The wall, both directions. The practice owner sees every registration
-- (he needs the whole pipeline and the expiry queue). The sales lead
-- sees ONLY rows he registered himself, and only inside the practice he
-- belongs to. A consultant sees nothing: sales is not delivery.
create policy sales_prospects_read on public.sales_prospects
  for select to authenticated
  using (
    private.keystone_can(practice_id, null, 'sales.manage')
    or (private.is_sales_lead(practice_id) and registered_by = auth.uid())
  );

-- Registration is self-authored. The sales lead cannot register a
-- prospect in someone else's name, and cannot register into a practice
-- he does not belong to.
create policy sales_prospects_insert on public.sales_prospects
  for insert to authenticated
  with check (
    registered_by = auth.uid()
    and (
      private.keystone_can(practice_id, null, 'sales.manage')
      or private.keystone_can(practice_id, null, 'sales.register')
    )
  );

create policy sales_prospects_update on public.sales_prospects
  for update to authenticated
  using (
    private.keystone_can(practice_id, null, 'sales.manage')
    or (private.is_sales_lead(practice_id) and registered_by = auth.uid())
  )
  with check (
    private.keystone_can(practice_id, null, 'sales.manage')
    or (private.is_sales_lead(practice_id) and registered_by = auth.uid())
  );

-- No delete policy, on purpose. A registration is a timestamp record in
-- a disagreement; release and expiry are statuses, not erasures.

-- ---------------------------------------------------------------------
-- 6. The collision guard, in the database
-- ---------------------------------------------------------------------

-- Runs on every insert through every path: the form, a route handler,
-- the service role, psql. A check that lives only in the form is a
-- check that is not there.
create or replace function private.keystone_sales_prospect_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_norm text := private.keystone_norm_org(new.org_name);
begin
  -- Lapsed claims stop blocking. Done here so the partial unique index
  -- above never needs a cron to stay true.
  update public.sales_prospects
     set status = 'expired', updated_at = now()
   where practice_id = new.practice_id
     and org_name_norm = v_norm
     and status = 'registered'
     and expires_at <= now();

  if exists (
    select 1 from public.house_accounts h
    where h.practice_id = new.practice_id and h.org_name_norm = v_norm
  ) then
    raise exception 'sales_collision_house_account'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.clients c
    where c.practice_id = new.practice_id
      and private.keystone_norm_org(c.name) = v_norm
  ) then
    raise exception 'sales_collision_existing_client'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.sales_prospects p
    where p.practice_id = new.practice_id
      and p.org_name_norm = v_norm
      and p.status = 'registered'
  ) then
    raise exception 'sales_collision_already_registered'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists sales_prospects_guard on public.sales_prospects;
create trigger sales_prospects_guard
  before insert on public.sales_prospects
  for each row execute function private.keystone_sales_prospect_guard();

-- ---------------------------------------------------------------------
-- 7. The live check the form calls
-- ---------------------------------------------------------------------

-- Minimal disclosure: a verdict on the one org the caller typed, never
-- the house-account list and never the client list. Membership-checked,
-- pinned search_path, revoked from anon, the same shape as
-- keystone_message_notify_targets and keystone_busy_intervals.
create or replace function public.keystone_sales_registration_check(
  p_practice uuid,
  p_org text
)
returns text
language plpgsql security definer stable
set search_path = ''
as $$
declare
  v_norm text := private.keystone_norm_org(p_org);
begin
  if not (private.is_sales_lead(p_practice) or private.is_practice_member(p_practice)) then
    return 'forbidden';
  end if;
  if v_norm = '' then
    return 'empty';
  end if;

  if exists (
    select 1 from public.house_accounts h
    where h.practice_id = p_practice and h.org_name_norm = v_norm
  ) then
    return 'house_account';
  end if;

  if exists (
    select 1 from public.clients c
    where c.practice_id = p_practice and private.keystone_norm_org(c.name) = v_norm
  ) then
    return 'existing_client';
  end if;

  if exists (
    select 1 from public.sales_prospects p
    where p.practice_id = p_practice
      and p.org_name_norm = v_norm
      and p.status = 'registered'
      and p.expires_at > now()
      and p.registered_by = auth.uid()
  ) then
    return 'registered_by_you';
  end if;

  if exists (
    select 1 from public.sales_prospects p
    where p.practice_id = p_practice
      and p.org_name_norm = v_norm
      and p.status = 'registered'
      and p.expires_at > now()
  ) then
    return 'registered_by_other';
  end if;

  return 'available';
end;
$$;
revoke all on function public.keystone_sales_registration_check(uuid, text) from public, anon;
grant execute on function public.keystone_sales_registration_check(uuid, text) to authenticated;
