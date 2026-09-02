-- The plan's own to-do list (specs/epayl-fundraising-hub.md, phase
-- four), the eight moves extracted mechanically from the design
-- reference. Prose deadlines stay prose (due_label); no date is
-- invented. Idempotent: a move that already exists by title is left
-- alone, so completions and edits survive a re-run.

insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask O’Hara to renew the $25,000', 'Biggest renewal on the board. Write down the condition attached to last year’s gift first, so the ask matches it.', 'Kendra', 'By October 15', 'Donors', null, 'manual'
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask O’Hara to renew the $25,000'
  );
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask Brandon for three referral names', 'He already offered. Ask for names, and for permission to use his name when you reach out.', 'Kendra', 'By October 10', 'Prospects', null, 'manual'
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask Brandon for three referral names'
  );
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Thank the Butchers properly for the $50,000', 'A gift that size needs a real thank you and a real report before any second ask.', 'Kendra', 'This month', 'Stewardship', null, 'manual'
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Thank the Butchers properly for the $50,000'
  );
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Count the monthly donors', 'You cannot grow a number you have not counted. Get the exact list and the exact monthly total from the region.', 'Remi', 'By September 30', 'Monthly', (select s.id from public.hub_strategies s where s.org_id = o.id and s.slug = 'monthly'), 'manual'
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Count the monthly donors'
  );
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Fix the two duplicate records', 'Butcher and Young each appear twice in the file. Until that is sorted, the giving history is wrong.', 'Remi', 'By September 30', 'Donors', null, 'manual'
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Fix the two duplicate records'
  );
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Set the brunch date and pick the host', 'Early November means invitations go out in early October. The host matters more than the venue.', 'Kendra', 'This week', 'Brunch', (select s.id from public.hub_strategies s where s.org_id = o.id and s.slug = 'brunch'), 'manual'
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Set the brunch date and pick the host'
  );
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Pick 12 names off the prospect list', 'Twelve is a real number of research and intro conversations for one fall. A hundred is not.', 'Kendra and Remi', 'By October 1', 'Prospects', null, 'manual'
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Pick 12 names off the prospect list'
  );
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Write down what each big donor cares about', 'Right now that information lives in Kendra’s head. If it stays there, nobody else can help raise money.', 'Kendra', 'Ongoing', 'Donor research', null, 'manual'
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Write down what each big donor cares about'
  );
