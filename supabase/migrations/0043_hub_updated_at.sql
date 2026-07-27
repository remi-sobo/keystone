-- Life hub Phase 6, prerequisite 3.1.3 (trellis specs/Life-hub-spec):
-- updated_at plus a touch trigger on the three tables the hub snapshot
-- endpoint reads. The Ring 0 recon confirmed none of them carried
-- updated_at, so no incremental (since-cursor) read was possible: an
-- edited row looked identical to an untouched one.
--
-- private.touch_updated_at is the repo's first shared touch function.
-- Later tables that grow an updated_at column should reuse it rather
-- than minting per-table copies.

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Existing rows land with updated_at = migration time, which is honest:
-- that is the first moment a delta reader could have seen them.

alter table public.action_items
  add column if not exists updated_at timestamptz not null default now();
alter table public.engagements
  add column if not exists updated_at timestamptz not null default now();
alter table public.workstreams
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists action_items_touch_updated_at on public.action_items;
create trigger action_items_touch_updated_at
  before update on public.action_items
  for each row execute function private.touch_updated_at();

drop trigger if exists engagements_touch_updated_at on public.engagements;
create trigger engagements_touch_updated_at
  before update on public.engagements
  for each row execute function private.touch_updated_at();

drop trigger if exists workstreams_touch_updated_at on public.workstreams;
create trigger workstreams_touch_updated_at
  before update on public.workstreams
  for each row execute function private.touch_updated_at();

-- The snapshot delta filters on updated_at within a practice scope.
create index if not exists action_items_updated_at_idx
  on public.action_items (updated_at);
create index if not exists engagements_updated_at_idx
  on public.engagements (updated_at);
create index if not exists workstreams_updated_at_idx
  on public.workstreams (updated_at);
