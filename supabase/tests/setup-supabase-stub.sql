-- Stub of the Supabase-managed environment, for running migrations
-- against a plain Postgres (the CI leak test, local checks). Pattern
-- from BloomOS supabase/tests/setup-supabase-stub.sql. Mirrors what the
-- platform provides: the auth schema with auth.uid() and auth.jwt(),
-- the anon/authenticated/service_role roles, and pgcrypto.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase resolves auth.uid() and auth.jwt() from the JWT; here both
-- read a session GUC the test driver sets per simulated user:
--   select set_config('request.jwt.claims',
--     '{"sub":"<uuid>","email":"<email>"}', false);
create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;

-- The platform grants the API roles access to the auth helper functions;
-- policies like `user_id = auth.uid()` evaluate as the querying role.
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function auth.jwt() to authenticated, anon, service_role;
grant select on auth.users to authenticated, anon, service_role;

grant usage on schema public to authenticated, anon, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, anon, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, anon, service_role;
