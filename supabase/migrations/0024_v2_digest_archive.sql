-- V2 3G: the digest archive (specs/keystone-v2-digest-archive.md).
-- The last epic of Phase 3.
--
-- The digest gets a memory: a client read policy for SENT rows only
-- (a record of what was sent must contain only what was sent; an
-- approved draft whose email failed stays practice-only), cadence per
-- engagement honored by the cron before any model call, and the
-- digest anchor value joining messages now that digests have a client
-- surface (closing the 3E deferral). No client write path of any kind
-- appears; digests keep zero session writes.

create policy digests_client_read on public.digests
  for select to authenticated
  using (status = 'sent' and private.is_member_of_client(client_id));

alter table public.engagements
  add column if not exists digest_cadence text not null default 'weekly'
    check (digest_cadence in ('weekly','biweekly','off'));

alter table public.messages drop constraint messages_anchor_type_check;
alter table public.messages add constraint messages_anchor_type_check
  check (anchor_type in
        ('session','action_item','deliverable','workstream','decision','digest'));
