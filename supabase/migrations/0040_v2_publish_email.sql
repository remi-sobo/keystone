-- The publish-time email (Remi's ask, 2026-07-21): when a session note
-- goes shared or homework lands on a client member, the people it
-- concerns hear about it that moment, not at the next day's cron. Two
-- new notification kinds; the rows ride the existing recipient-walled
-- table, and lib/publishNotice.ts sends one email per person then
-- stamps emailed_at so the daily batch never repeats the touch.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in
        ('homework_submitted','homework_feedback','homework_due','homework_overdue',
         'poll_opened','poll_booked','deliverable_shipped','approval_waiting','message_reply',
         'session_reminder','approval_decided','closeout_published',
         'change_order_requested','change_order_decided',
         'homework_assigned','note_published'));
