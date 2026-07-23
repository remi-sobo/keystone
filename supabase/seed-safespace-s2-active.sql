-- Keystone roadmap truth for Session 2 day (Thu 2026-07-23): Session 1
-- is behind us, Session 2 runs at 3:00 Pacific. Flips the two
-- engagement_sessions rows (0038) so the client home shows S1 with the
-- brass tick and S2 breathing as now. Flipping S1 to done also opens
-- its teaching deck to client members for the first time: the roadmap
-- deck link and the presenter wall both key on status done (0039), the
-- designed reveal.
--
-- Idempotent: each update names the exact row and target status, so a
-- re-run touches nothing new. Scoped to SafeSpace by client, never by
-- bare code alone.

update engagement_sessions
   set status = 'done'
 where code = 'S1'
   and client_id = (select id from clients where name = 'SafeSpace')
   and status <> 'done';

update engagement_sessions
   set status = 'active'
 where code = 'S2'
   and client_id = (select id from clients where name = 'SafeSpace')
   and status <> 'active';

-- The apply log says what the clients now see.
select es.code, es.title, es.status, es.scheduled_at
from engagement_sessions es
where es.client_id = (select id from clients where name = 'SafeSpace')
  and es.sort_order <= 3
order by es.sort_order;
