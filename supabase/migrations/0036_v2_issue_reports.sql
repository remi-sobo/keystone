-- Help FAB, the report half (specs/keystone-v2-help-fab.md).
--
-- A client leader hits a floating button on any room and files an
-- issue: a bug, something confusing, or an idea. The row lands here and
-- the practice owners get an email. The coach half of the same FAB
-- reuses the 2E Q&A path unchanged and writes nothing new, so this
-- table is the only new storage the feature needs.
--
-- Shape follows the decision log and messages: both scope ids ride the
-- row (denormalized practice_id per spec 5.1), reported_side names the
-- wall the author stood behind so reads never join to memberships, and
-- there is no update and no delete policy. A filed report is a record;
-- triage happens on the practice side by reading, never by editing the
-- client's words. Client-visible by design (both walls read), because
-- the report is a note from the client to the practice about their own
-- room, and nothing about another client or practice can reach it.

create table if not exists public.issue_reports (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  kind          text not null check (kind in ('bug','confusing','idea')),
  body          text not null check (char_length(body) between 1 and 4000),
  -- Which wall the reporter stood behind. The FAB ships on the client
  -- surface first; the column keeps the practice case open without a
  -- later migration.
  reported_side text not null check (reported_side in ('practice','client')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists issue_reports_engagement_idx
  on public.issue_reports (engagement_id, created_at desc);

-- Filing an issue rides the permission authority like a message does.
insert into public.role_permissions (role, permission) values
  ('client_member', 'issue.write'),
  ('owner',         'issue.write'),
  ('consultant',    'issue.write')
on conflict do nothing;

alter table public.issue_reports enable row level security;

-- Read: both walls, inside their own scope.
create policy issue_reports_read on public.issue_reports
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or private.is_member_of_client(client_id)
  );

-- Insert: you file only as yourself, only from the wall you actually
-- stand behind, only inside your own scope. The client branch rides the
-- permission authority so the client dimension can never drop out.
create policy issue_reports_insert on public.issue_reports
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      (reported_side = 'practice' and private.is_practice_member(practice_id))
      or (
        reported_side = 'client'
        and private.is_member_of_client(client_id)
        and private.keystone_can(practice_id, client_id, 'issue.write')
      )
    )
  );

-- No update policy. No delete policy. Filed means filed.
