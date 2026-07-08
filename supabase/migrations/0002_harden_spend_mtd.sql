-- Ring 1 hardening: the Supabase security advisor flagged
-- keystone_ai_spend_mtd with a role-mutable search_path. Pin it empty
-- like every other function in the schema (the table reference is
-- already schema-qualified). Behavior unchanged.

create or replace function public.keystone_ai_spend_mtd(p_practice_id uuid)
returns numeric
language sql stable
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0)
  from public.ai_spend_ledger
  where practice_id = p_practice_id
    and created_at >= date_trunc('month', now());
$$;
