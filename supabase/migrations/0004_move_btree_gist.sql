-- Ring 2 hardening: the Supabase advisor flags extensions living in the
-- public schema. Move btree_gist (relocatable) to the conventional
-- extensions schema. The sessions_no_overlap constraint keeps working:
-- its operators were bound at creation.

create schema if not exists extensions;

do $$ begin
  alter extension btree_gist set schema extensions;
exception when undefined_object then
  -- Fresh database where 0003 has not created it yet in public (should
  -- not happen given ordering, but stay idempotent).
  create extension if not exists btree_gist with schema extensions;
end $$;

grant usage on schema extensions to authenticated, anon;
