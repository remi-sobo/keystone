-- Planned deliverables: promises get structure (the deferral in
-- CURRENT.md, "the deliverable-promised queue source (until promises
-- have structure)", closed on Remi's ask 2026-07-13).
--
-- One table, two states. A deliverable is born either shipped (the
-- Ring 4 shape: a real file or link, delivered on a date) or planned
-- (a title, a workstream, an optional expected note; no artifact yet).
-- Fulfilling a plan flips the SAME row to shipped, so the promise and
-- the receipt are one record and the client timeline never shows a
-- duplicate.
--
-- NO RLS changes: both walls (practice_id, client_id) and all four
-- policies have been on this table since 0006, and planned rows are
-- client-visible by design; that is the point (the plan is part of
-- what the fee buys). The check constraint is the honesty wall: a
-- planned row can never smuggle a payload, a shipped row can never
-- lack one.

alter table public.deliverables
  add column if not exists status text not null default 'shipped'
    check (status in ('planned','shipped')),
  add column if not exists expected_note text;

-- A planned row has no artifact shape yet and no delivered date.
alter table public.deliverables alter column kind drop not null;
alter table public.deliverables alter column delivered_on drop not null;

-- The 0006 constraints assumed every row shipped; the status shape
-- replaces both (the kind check and the payload check) in one
-- two-sided rule.
alter table public.deliverables drop constraint if exists deliverables_kind_check;
alter table public.deliverables drop constraint if exists deliverables_kind_payload;
alter table public.deliverables add constraint deliverables_status_shape check (
  (
    status = 'shipped'
    and kind in ('file','link')
    and delivered_on is not null
    and (
      (kind = 'file' and storage_path is not null)
      or (kind = 'link' and url is not null)
    )
  )
  or (
    status = 'planned'
    and kind is null
    and storage_path is null
    and url is null
    and delivered_on is null
  )
);

create index if not exists deliverables_status_idx
  on public.deliverables (engagement_id, status);
