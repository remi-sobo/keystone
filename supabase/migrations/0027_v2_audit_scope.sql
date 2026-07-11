-- V2 activity view: scope columns on the audit log
-- (specs/keystone-v2-activity.md).
--
-- The audit log has been append-only metadata since Ring 1: actor,
-- action, target identifier, small detail, never values. To read it
-- back per engagement it needs the scope stamped on the row. Nullable
-- columns, NO foreign keys: an audit row must outlive whatever it
-- describes, untouched even by a cascade. Rows older than this
-- migration carry null scope and simply do not appear in the
-- per-engagement feed; the trail is honest about when it started.
--
-- The table stays deny-all: RLS on, zero policies, service role is
-- the only reader and writer. The feed renders on the practice
-- surface through the sanctioned service-role-after-check path.

alter table public.audit_log
  add column if not exists practice_id uuid,
  add column if not exists engagement_id uuid;

create index if not exists audit_log_engagement_idx
  on public.audit_log (engagement_id, created_at desc);
