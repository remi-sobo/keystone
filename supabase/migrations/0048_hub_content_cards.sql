-- 0048: one more content block shape (specs/epayl-fundraising-hub.md,
-- phase three). The handoff's strategy playbooks carry card rows
-- (tag, value, title, note) that are richer than a stat_row; the
-- block kind list grows by one so the plan's own copy fits in rows
-- without flattening. Data only; policies and scope unchanged.

alter table public.hub_content_blocks
  drop constraint if exists hub_content_blocks_kind_check;
alter table public.hub_content_blocks
  add constraint hub_content_blocks_kind_check
  check (kind in ('headline','lead','paragraph','table','stat_row','cards'));
