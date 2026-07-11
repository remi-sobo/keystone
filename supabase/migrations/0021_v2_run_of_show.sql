-- V2 3B: the run of show (specs/keystone-v2-run-of-show.md).
--
-- The upcoming side of a session gets its structure: the purpose, the
-- agenda, the workstream-and-stage it intends to move (structured, so
-- 4A and 4E can read it later), and a courtesy note when a reschedule
-- happens. Also closes the recon finding: the client's session.book
-- permission could update ANY sessions column; from here the
-- authenticated role may update exactly the reschedule verbs, and the
-- practice-authored structure rides the service role after the check.
-- Calendar sync already writes through the service role, unaffected.

alter table public.sessions
  add column if not exists purpose text,
  add column if not exists agenda_md text,
  add column if not exists moves_workstream_id uuid references public.workstreams(id) on delete set null,
  add column if not exists moves_to_stage text,
  add column if not exists reschedule_note text;

-- The reschedule verbs, and nothing else, for sessions on both sides.
revoke update on public.sessions from authenticated;
grant update (starts_at, ends_at, tz, status, updated_at, reschedule_note)
  on public.sessions to authenticated;

-- 4F grows one kind: the session's own reminder (V2 3B, one touch the
-- day before, dedupe-keyed, batched like everything else).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in
        ('homework_submitted','homework_feedback','homework_due','homework_overdue',
         'poll_opened','poll_booked','deliverable_shipped','approval_waiting','message_reply',
         'session_reminder'));
