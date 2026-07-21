-- Keystone Session 1 close-out: the two pre-work items read as complete.
-- Session 1 happened Tue 2026-07-21 and the pre-work was covered in the
-- room. action_items has no archived flag, so the close is the agreed
-- fallback: a final line appended to each body, plus status 'done' so
-- the items leave the open list while staying on the record. Nothing is
-- deleted; the pre-work is part of the engagement's history.
--
-- Idempotent: the body append guards on its own line, and the status
-- update touches open rows only, so a row an assignee already closed
-- (Aris checked his off before the session) keeps its original done_at.

update action_items ai
set body_md = ai.body_md
  || E'\n\nCovered in Session 1. Thank you. Your new homework is below.'
where ai.client_id = (select id from clients where name = 'SafeSpace')
  and ai.title like 'Pre-work:%'
  and ai.timing = 'before_session'
  and ai.body_md is not null
  and ai.body_md not like '%Covered in Session 1.%';

update action_items ai
set status = 'done', done_at = now()
where ai.client_id = (select id from clients where name = 'SafeSpace')
  and ai.title like 'Pre-work:%'
  and ai.timing = 'before_session'
  and ai.status = 'open';

-- The apply log says what landed
select ai.title, ai.status, count(*) as rows,
       bool_and(ai.body_md like '%Covered in Session 1.%') as body_closed
from action_items ai
where ai.client_id = (select id from clients where name = 'SafeSpace')
  and ai.title like 'Pre-work:%'
group by ai.title, ai.status
order by ai.title;
