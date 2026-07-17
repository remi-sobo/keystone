-- Help FAB reports, owner-only read plus practice-authored reports
-- (specs/keystone-v2-help-fab.md, on Remi's ask).
--
-- Two changes, one intent: Remi runs the system, so only the practice
-- owner may READ what gets reported, and everyone else (client leaders
-- and the practice's own consultants) may FILE a report that comes to
-- the owner, without being able to read the list.
--
--   1. Read narrows from both walls to the owner alone. A new
--      issue.read permission is granted only to 'owner'; the read
--      policy asks the permission authority for it. A consultant or a
--      client member now reads zero issue_reports.
--   2. A report no longer requires an engagement. A consultant filing a
--      system issue has no client and no engagement, so engagement_id
--      and client_id become nullable. A CHECK keeps a client-authored
--      report fully scoped (both ids present) so the cross-client wall
--      on client reports is unchanged; a practice-authored report
--      carries practice_id alone.
--
-- The write path is otherwise unchanged: the insert policy already
-- admits a practice member on the practice side and a client member on
-- their own wall, each as themselves. Delivery to the owner for a
-- practice-authored report rides a new minimal-disclosure RPC
-- (keystone_issue_notify_targets), the practice-caller twin of
-- keystone_message_notify_targets.

-- 1. Scope ids optional for a practice-authored report.
alter table public.issue_reports alter column engagement_id drop not null;
alter table public.issue_reports alter column client_id drop not null;

-- A client-authored report stays fully scoped; a practice-authored one
-- carries practice_id alone. This keeps the cross-client isolation of
-- client reports structural, not merely enforced by the app.
alter table public.issue_reports
  add constraint issue_reports_scope_shape check (
    (reported_side = 'client' and client_id is not null and engagement_id is not null)
    or (reported_side = 'practice')
  );

-- 2. Read is the owner's alone. issue.read is an owner-only permission.
insert into public.role_permissions (role, permission) values
  ('owner', 'issue.read')
on conflict do nothing;

drop policy if exists issue_reports_read on public.issue_reports;
create policy issue_reports_read on public.issue_reports
  for select to authenticated
  using (private.keystone_can(practice_id, null, 'issue.read'));

-- Delivery target for a practice-authored report: the owner emails of
-- the CALLER'S OWN practice. Same minimal-disclosure pattern as
-- keystone_message_notify_targets (membership-checked, pinned
-- search_path, owner emails only, revoked from anon), but resolved from
-- the caller's practice membership so it needs no engagement. The client
-- path keeps using the engagement-keyed message RPC.
create or replace function public.keystone_issue_notify_targets(p_practice uuid)
returns table (email text)
language sql security definer stable
set search_path = ''
as $$
  select pm.email
  from public.practice_members pm
  join public.practice_members caller
    on caller.practice_id = pm.practice_id and caller.user_id = auth.uid()
  where pm.practice_id = p_practice
    and pm.role = 'owner'
    and pm.user_id is not null;
$$;
revoke all on function public.keystone_issue_notify_targets(uuid) from public, anon;
grant execute on function public.keystone_issue_notify_targets(uuid) to authenticated;

-- Insert unchanged (self-authorship on your own wall). No update, no
-- delete: a filed report is still a record.
