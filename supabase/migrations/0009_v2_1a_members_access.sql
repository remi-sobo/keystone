-- V2 1A: members and access (specs/keystone-v2-admin-ui.md).
--
-- Two halves:
--   1. Four columns on each membership table: soft revocation
--      (revoked_at, revoked_by) and invite bookkeeping (invited_by,
--      last_invite_sent_at). No new tables; deactivation never deletes.
--   2. The predicate hardening, the security heart: every membership
--      predicate gains "revoked_at is null" HERE, in one migration, so
--      a revocation instantly closes every RLS policy, both app
--      resolvers, the email-keyed claim path, and the message notify
--      targets. No policy is edited individually; the wall stays one
--      wall.
--
-- The functions below are re-creations of their 0001/0005/0007 bodies
-- plus the revoked filter. create or replace preserves grants; the
-- revoke/grant statements are restated anyway so this file reads
-- complete on its own.

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------

alter table public.practice_members
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists last_invite_sent_at timestamptz;

alter table public.client_members
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists last_invite_sent_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Predicate hardening (revoked_at is null everywhere membership is
--    decided)
-- ---------------------------------------------------------------------

create or replace function private.is_practice_member(p_practice uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.practice_members
    where user_id = auth.uid() and practice_id = p_practice and user_id is not null
      and revoked_at is null
  );
$$;

create or replace function private.is_member_of_client(p_client uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members
    where user_id = auth.uid() and client_id = p_client and user_id is not null
      and revoked_at is null
  );
$$;

create or replace function private.is_client_member_of_practice(p_practice uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members
    where user_id = auth.uid() and practice_id = p_practice and user_id is not null
      and revoked_at is null
  );
$$;

create or replace function private.keystone_can(p_practice uuid, p_client uuid, p_perm text)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_members m
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid()
      and m.practice_id = p_practice
      and m.revoked_at is null
      and rp.permission = p_perm
  ) or exists (
    select 1
    from public.client_members cm
    join public.role_permissions rp on rp.role = cm.role
    where cm.user_id = auth.uid()
      and cm.practice_id = p_practice
      and cm.revoked_at is null
      and p_client is not null
      and cm.client_id = p_client
      and rp.permission = p_perm
  );
$$;

create or replace function private.owns_client_membership(p_member uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members
    where id = p_member and user_id = auth.uid()
      and revoked_at is null
  );
$$;

-- The claim path: a revoked row can never be re-claimed by signing in
-- again. The email stays the credential for LIVE pending rows only.
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
end;
$$;

-- Notify targets: a revoked owner stops receiving client-message email,
-- and a revoked client member can no longer enumerate owner emails.
create or replace function public.keystone_message_notify_targets(p_engagement uuid)
returns table (email text)
language sql security definer stable
set search_path = ''
as $$
  select pm.email
  from public.practice_members pm
  join public.engagements e on e.practice_id = pm.practice_id
  join public.client_members cm
    on cm.client_id = e.client_id and cm.user_id = auth.uid()
   and cm.revoked_at is null
  where e.id = p_engagement
    and pm.role = 'owner'
    and pm.user_id is not null
    and pm.revoked_at is null;
$$;

-- ---------------------------------------------------------------------
-- 3. Grants, restated
-- ---------------------------------------------------------------------

revoke all on function private.is_practice_member(uuid) from public, anon;
revoke all on function private.is_member_of_client(uuid) from public, anon;
revoke all on function private.is_client_member_of_practice(uuid) from public, anon;
revoke all on function private.keystone_can(uuid, uuid, text) from public, anon;
revoke all on function private.owns_client_membership(uuid) from public, anon;
revoke all on function public.keystone_claim_membership() from public, anon;
revoke all on function public.keystone_message_notify_targets(uuid) from public, anon;
grant execute on function private.is_practice_member(uuid) to authenticated;
grant execute on function private.is_member_of_client(uuid) to authenticated;
grant execute on function private.is_client_member_of_practice(uuid) to authenticated;
grant execute on function private.keystone_can(uuid, uuid, text) to authenticated;
grant execute on function private.owns_client_membership(uuid) to authenticated;
grant execute on function public.keystone_claim_membership() to authenticated;
grant execute on function public.keystone_message_notify_targets(uuid) to authenticated;
