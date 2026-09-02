-- 0049: two task columns phase four needs (specs/
-- epayl-fundraising-hub.md). The plan's own tasks carry PROSE
-- deadlines ("By October 15", "This week", "Ongoing") and a plan-side
-- grouping word. A prose deadline is not a date and inventing the
-- missing precision would be a guess, so it gets its own column and
-- renders verbatim when due_date is null. Data only; scope and
-- policies unchanged.

alter table public.hub_tasks
  add column if not exists due_label text,
  add column if not exists area text;
