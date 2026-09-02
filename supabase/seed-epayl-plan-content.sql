-- The EPA plan content seed, REGENERATED for Fundraising Hub v2
-- (specs/epayl-fundraising-hub.md). Every row extracted mechanically
-- from docs/handoff/epayl/fundraising-hub-v2.dc.html, whose copy is
-- final; the stewardship lead and fix-first cards carry over from v1
-- unchanged. Idempotent: each owned section is replaced wholesale.
-- v2 retires the seven-strands table (the five strategies plus the
-- gift table now carry the whole plan) and brings real content for
-- risks, open questions, the ask calendar, and every strategy's
-- method fields.

update public.hub_strategies s set
  goal_cents = 13000000, goal_trust = 'stated',
  owner = 'Kendra', hours_per_week = 3, hours_trust = 'stated',
  precondition = 'A one-page case for support. You cannot ask for $25,000 with nothing to leave behind.', dependency = 'Remi for the case for support. Brandon for the referral names.',
  failure_mode = 'The renewal asks slide to spring. Every one of last year’s four gifts came in between October and March, so a late ask is a missed year.', done_means = 'Six households have said yes in writing, and the four renewals happened before March.'
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'major-gifts';
update public.hub_strategies s set
  goal_cents = 1800000, goal_trust = 'stated',
  owner = 'Remi', hours_per_week = 1, hours_trust = 'stated',
  precondition = 'The real list from the region. Exact names, exact amounts, exact dates.', dependency = 'The region’s donor services team, who hold the recurring gift records.',
  failure_mode = 'The estimated total gets used in the goal. Then the plan rests on a number nobody verified.', done_means = 'Thirty households giving monthly, the list is accurate, and every one of them has heard from you this quarter.'
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'monthly';
update public.hub_strategies s set
  goal_cents = 1500000, goal_trust = 'stated',
  owner = 'Kendra', hours_per_week = 2, hours_trust = 'stated',
  precondition = 'A host. A woman with a home, a network, and real belief in this ministry, who invites, opens the room, and gives first.', dependency = 'The host for the guest list. House photography for the invitation.',
  failure_mode = 'The ministry sends the invitations instead of the host. A peer invitation fills a room and an organizational one does not.', done_means = 'Fifteen guests in the room, every one contacted within 48 hours afterward, and $15,000 raised or pledged.'
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'brunch';
update public.hub_strategies s set
  goal_cents = 500000, goal_trust = 'stated',
  owner = 'Kendra', hours_per_week = 0.5, hours_trust = 'stated',
  precondition = 'A list of churches where a leader, a family, or a committee member already attends. Start with people, not buildings.', dependency = 'The volunteer leaders, who are the actual connection to most of these congregations.',
  failure_mode = 'You ask for money before anybody there knows who you are, or you miss the annual mission budget cycle and wait a year.', done_means = 'Two or three churches giving, and at least two churches sending volunteer leaders.'
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'churches';
update public.hub_strategies s set
  goal_cents = 1000000, goal_trust = 'stated',
  owner = 'Kendra’s mother', hours_per_week = 0.5, hours_trust = 'stated',
  precondition = 'A warm connection. Do not write to a foundation where nobody knows anybody.', dependency = 'Kendra’s mother, who is taking on grant research, and the donors who can open their own foundation doors.',
  failure_mode = 'Cold grant writing eats a month and returns nothing. It is the slowest fundraising there is.', done_means = 'The Young Life grant is confirmed for this year, and two warm foundation conversations have happened.'
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'grants';

delete from public.hub_content_blocks b using public.hub_orgs o
where o.id = b.org_id and o.slug = 'epayl' and b.section in ('plan-strands', 'plan-gift-table', 'plan-risks', 'plan-open-questions', 'money-unsettled', 'strategy', 'work-calendar', 'stewardship');

insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"Gifts of $10,000 and up. Four households gave $102,000 last year, so this is not a new idea, it is the thing that already works. It is also where the year is won or lost, and it is almost entirely renewals plus a small number of new names."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'major-gifts';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The steps"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'major-gifts';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Step","When","What happens","Who owns it"],"rows":[["Write down the O’Hara condition","This week","Whatever was attached to the first $25,000. They have now given twice and it still exists only in Kendra’s memory.","Kendra"],["Thank the Butchers properly","This week","Handwritten, plus a one-page report on what the $50,000 did. Before any second ask.","Kendra"],["Ask the Butchers to renew the $50,000","By October 15","In person. Now the biggest single renewal left on the board.","Kendra"],["Ask Brandon for three names","By October 10","He offered. Ask for names and permission to use his name.","Kendra"],["Pick 12 prospects to research","By October 1","Twelve is a real number of intro conversations for one fall. A hundred is not.","Kendra and Remi"],["Ask Young to renew, asked up","By December","$3,000 to $5,000 if the two records turn out to be one family.","Kendra"],["Get an email address for the Allens","This month","Two $10,000 gifts and no email on file. Everything has to go through Kendra personally until that is fixed.","Remi"]]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'major-gifts';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"Monthly gifts are the only money you can count on before it arrives. One household is confirmed, Dele and Kesle at $100 a month, and about five more give monthly according to their gift counts. Nobody has verified that list. Fix the counting first, then grow it. Thirty households at $50 a month is $18,000 and one recruiting conversation a week."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The steps"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Step","When","What happens","Who owns it"],"rows":[["Get the real list from the region","September","You cannot ask people to upgrade if you do not know what they give.","Remi"],["Ask Nathan Frank why he gives","September","He has given 148 times. His reason, in his words, is the best recruiting line you will get.","Kendra"],["Add a monthly option to every ask","October","$50 a month instead of $600 once. Same money, easier yes, and it renews itself.","Kendra"],["Ask every leader parent once","November","Parents of kids in the ministry are the most natural monthly partners and the least asked.","Kendra"],["Thank monthly partners by name","Quarterly","A short note with one story. Monthly partners quit when they feel like a bank transfer.","Remi"]]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"Early November. Fifteen women in a room, hosted by one of them. Budget is $2,500 and the target is $15,000. The host matters more than the venue and the invitation matters more than the program."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The steps"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Step","When","What happens","Who owns it"],"rows":[["Pick the host","This week","The single most important decision in this strategy.","Kendra"],["Set the date","This week","Early November, weekday late morning. Avoid Thanksgiving week.","Kendra"],["Build the guest list","Late September","Twenty names to get fifteen in the room. The host owns the list.","Host and Kendra"],["Send invitations","Early October","Paper or a personal note, not a mass email. Four weeks of lead time.","Host"],["Rehearse the ask","Late October","Out loud, twice. Ninety seconds, once, near the end. The ask is the part everybody skips practicing.","Kendra and Remi"],["Follow up with every guest","Within 48 hours","Whether they gave or not.","Remi drafts, Kendra signs"]]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The shape of the day"}', 3
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Piece","Target","What it is","Notes"],"rows":[["Guests","15 women","Invited by the host, not by the ministry. A personal invitation from a peer is what fills the room.","Aim for 20 invitations to get 15 in the room."],["Average gift","$1,000","Fifteen guests at an average of $1,000 gets you to $15,000. Some will give $5,000, most will give less.","Do not set a minimum. It shrinks the room."],["The ask","90 seconds","One person asks, once, clearly, near the end. Everyone leaves with a card and a way to give.","Kendra asks. Nobody else."],["The story","5 minutes","One story about one kid, told with permission. No slideshow, no statistics.","Written parental consent before any kid is named."],["Follow-up","48 hours","Every guest gets a note within two days, whether they gave or not.","Remi drafts, Kendra signs."]]}', 4
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"Nothing is committed from a church today. The relationships exist and have never been asked. Church money is smaller than a major gift and steadier than an event, and the real prize is volunteer leaders, not dollars."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'churches';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The steps"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'churches';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Step","When","What happens","Who owns it"],"rows":[["List every connected church","By October","Ask the leaders where they go. That is the list.","Kendra"],["Ask for a speaking slot, not money","Fall","Five minutes in front of the congregation, or a table after the service.","Kendra"],["Ask for one line in the mission budget","Winter","Church budgets get set months ahead. Missing the calendar means waiting a year.","Kendra"],["Ask for leaders too","Ongoing","A church that sends two volunteer leaders is worth more than one that sends $2,500.","Kendra"]]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'churches';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"One $10,000 Young Life grant is the only thing here so far. Grants are slow and they are not a rescue plan. What makes them worth working is that three of last year’s donors are already connected to foundations."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The steps"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Step","When","What happens","Who owns it"],"rows":[["Confirm the Young Life grant repeats","September","And find out what it requires. It is the only grant on record.","Remi"],["Ask O’Hara how his foundation decides","After the renewal","About $8M in assets. Separate conversation from the personal gift, never the same meeting.","Kendra"],["Ask Brandon whether his foundation is the right door","Fall","Over $500M in assets. He may say no, and that is useful.","Kendra"],["Research three local funders","By November","Two hours. Pick three that fund youth work in San Mateo County.","Grant research"]]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"What is on the board"}', 3
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Source","Size","Status","Next step"],"rows":[["Young Life area grant","$10,000","Received. The only grant money on record.","Confirm whether it repeats this year and what it requires."],["Foundation connected to the O’Hara household","About $8M in assets","Not approached. Shows up in the donor file, not from a conversation.","Ask John how the foundation makes decisions. Not in the same meeting as a personal ask."],["Foundation connected to the Brandon household","Over $500M in assets","Not approached. Large, and probably has its own process.","Ask him whether it is even the right door. He may say no, and that is useful."],["Foundation connected to the Allen household","Large fund on record","Not approached.","Research only. No ask this year."],["Local Peninsula funders","Unknown","Not researched.","Two hours of research. Pick three that fund youth work in San Mateo County."]]}', 4
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'plan-gift-table', null, 'lead', '{"text":"This is the arithmetic under major gifts and monthly partners together. Read it top down, because the biggest gifts do most of the work."}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'plan-gift-table', null, 'table', '{"columns":["Level","Gifts needed","Named so far","Adds up to","Where they come from"],"rows":[["$50,000","1","1","$50,000","Butcher renewal. Everything else in the plan assumes this one repeats."],["$25,000","2","2","$50,000","O’Hara is in. Brandon asked up from $17,000 is the other one."],["$10,000","3","1","$30,000","Allen is in. Two new households to find, and one should come from a Brandon introduction."],["$5,000","6","1","$30,000","Young asked up from $3,000, plus five new. The brunch and the prospect list both feed this row."],["$2,500","6","0","$15,000","Nobody yet. Churches and brunch guests are the most likely source."],["$1,000","12","0","$12,000","The newsletter list and the spring event. Twelve at a thousand is a target, not a stretch."],["Under $1,000","25","6","$12,245","Monthly partners and the small-gift crowd. Six households already give here every year."]]}', 1
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'plan-risks', null, 'table', '{"columns":["The risk","What happens","What to watch"],"rows":[["Concentration: Four households are most of the money","Last year four gifts made up $102,000 of $108,187. Two of the four have already given again this year. The Butcher $50,000 has not, and it is the single largest number in the plan.","The Butcher renewal ask in October"],["Capacity: About seven hours a week against a $199,245 goal","Kendra has roughly seven hours a week for fundraising and club and camp cannot move. So anything unplanned comes out of the fundraising, and nobody has timed the work to know whether seven is enough.","The overdue count on the task list"],["Timing: March is the wall, not December","Cash on hand plus what is committed covers October through December. It falls about $39,000 short of what the year needs by the end of March, which is when Woodleaf deposits and the WyldLife weekend land.","The checkpoints in MONEY"],["Key person: The relationships live in one head","What each big donor cares about, why the Butchers gave, what condition came with the O’Hara gift. None of it is written down. If Kendra is unavailable for a month, nobody can carry the asks.","The relationship notes on each household"]]}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'plan-open-questions', null, 'table', '{"columns":["What is not settled","Who owns it","What the plan assumes meanwhile"],"rows":[["What condition came with the O’Hara gift?","Kendra","They have now given $25,000 twice, so the plan treats the condition as satisfied. Nobody has checked whether it still applies."],["Why did the Butchers give $50,000, and who asked?","Kendra","The gift table assumes this repeats. Nothing supports that assumption yet."],["How many monthly partners are there, and what do they give in total?","Remi","One is confirmed, Dele and Kesle at $100 a month. About five more are guessed from gift counts, and their amounts are unknown."],["Are the two Butcher records and the two Young records the same families?","Remi","Treated as separate, which understates two lifetime giving totals."],["What does part time mean for the second staff hire, in hours and dollars?","Kendra and Remi","$35,000 starting August of year two. This is a placeholder and year two rests on it."],["Who is on the fundraising committee today, by name?","Kendra","The budget says three people. An earlier correction said one. The plan assumes no committee capacity."],["What does getting kids to camp actually cost?","Kendra","Zero, because kids carpool. The camp figure is low by whatever a bus costs."],["Which churches already have people connected to this ministry?","Kendra","$5,000 from two or three churches, with no names behind it."],["Is seven hours a week enough to run this plan?","Kendra and Remi","That it is. Nobody has timed the work, and there is no margin if a week goes sideways."],["What did the O’Hara and Allen gifts actually arrive as, and on what dates?","Remi","January and February, entered by hand. If the dates are wrong the overdue thank-you flags are wrong too."]]}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'money-unsettled', null, 'table', '{"columns":["The number","How well we know it","The story"],"rows":[["Second staff position, $35,000","Placeholder","This number was invented, not given. Kendra said part time starting around August of year two and that housing does not change the pay. Nobody has said what part time means in hours or dollars. It is the largest unconfirmed figure in the budget."],["Getting kids to camp, $0","Not priced","Kids carpool today. Kendra wants a shared bus with other Peninsula areas and floated $5,000 a year. Until that is priced, the camp number is low."],["Technology and mileage, $0","Not priced","Kendra says about $2,000 covers mileage and the phone bill, and that some tech is already inside the service charge. Gas is roughly $200 a month, untracked."],["Cash on hand, $28,295","Stated","Kendra’s figure, $28,294.76, with about $10,000 more expected from capital. She says the split between restricted and usable is handled at the region and she cannot see it."],["The year runs October to September","Settled","Kendra chose the region’s calendar over the school year. The budget tabs were built on August to July, so the month columns are shifted by two."],["Camp rates","Verified","$750 per kid at Woodleaf June 19 to 23, $175 per kid for weekend camps. Both confirmed by Kendra. All-in cost per kid at camp is $1,290."]]}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'work-calendar', null, 'lead', '{"text":"The year runs October through September. Expenses are known because the camp dates and the ministry calendar are set. Income timing is up to you, which is what this page is for. Money has to arrive before it is spent, not in the same month."}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'work-calendar', null, 'headline', '{"text":"The asks, month by month"}', 1
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'work-calendar', null, 'table', '{"columns":["Month","The asks","The target"],"rows":[["October","Butcher renewal ask. Brunch invitations out. Report to O’Hara and Allen on this year’s gifts.","$50,000 asked"],["November","The brunch itself. Ask the Brandon referrals.","$15,000 target"],["December","Year-end appeal to the whole list. December is the biggest giving month of the year everywhere.","$10,000 target"],["January","Close anything that slipped from the fall. Start monthly recruiting in earnest.","Catch-up"],["February","Camp-specific asks. Camp gifts skip the 17 percent if the donor writes camp on the gift.","$12,000 target"],["March","Second half of the big-gift asks. Grant research turns into two real conversations.","$30,000 asked"],["April","Be a Kid for a Day. Kids raising their own camp money starts here.","$6,000 target"],["May","Final camp gap ask. Fifteen kids at $750 each, minus what the kids raise.","$8,000 target"],["June","Nothing new. This month is for showing up with kids at Woodleaf.","No asks"],["July to September","Report to every donor. Set next year’s plan in August, not September.","No asks"]]}', 2
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'stewardship', null, 'lead', '{"text":"Getting a gift is the easy half. Most donors leave because nobody told them what happened with their money. Here is the minimum for every level, and it is a real commitment, so do not promise more than you will do."}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'stewardship', null, 'headline', '{"text":"What each donor hears, and when"}', 1
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'stewardship', null, 'table', '{"columns":["Gift size","How often","What they get","Who does it"],"rows":[["$10,000 and up","6 times a year","A handwritten thank-you inside a week. A call from Kendra twice a year. One in-person visit. A one-page report on what the gift did.","Kendra"],["$1,000 to $9,999","4 times a year","A thank-you inside two weeks with one specific detail about what the money covered. The newsletter. One personal note that is not an ask.","Kendra"],["Monthly partners","Every quarter","A short note with one story. An annual total for taxes. Never an ask disguised as a thank-you.","Remi"],["Under $1,000","3 times a year","A thank-you inside two weeks. The newsletter. A year-end note.","Remi"],["Brunch and event guests","Twice","A note within 48 hours, whether they gave or not. One follow-up in the spring.","Remi drafts, Kendra signs"]]}', 2
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'stewardship', null, 'headline', '{"text":"Three rules"}', 3
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'stewardship', null, 'paragraph', '{"text":"Thank people faster than feels necessary. Report on the money before anyone asks. And never let a thank-you carry an ask inside it, because donors can feel it and it costs more than the gift is worth."}', 4
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'stewardship', null, 'headline', '{"text":"What is broken right now"}', 5
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'stewardship', null, 'cards', '{"cards":[{"tag":"Fix first","value":"$50,000","title":"The Butcher gift","note":"The largest gift this area has ever received. Nothing on record about a thank-you or a report."},{"tag":"Fix first","value":"163 gifts","title":"Sylvia Spates","note":"Has given 163 times since 2009. Almost certainly never thanked at the level that deserves."},{"tag":"Fix first","value":"148 gifts","title":"Nathan Frank","note":"Twelve straight years of monthly giving. Nobody has asked him why."}]}', 6
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_collateral (org_id, practice_id, name, owner, due_date, status, blocks, sort)
select o.id, o.practice_id, 'The real monthly partner list', 'Remi', '2026-09-30', 'missing', 'the monthly upgrade asks and makes the monthly goal an estimate', 4
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_collateral x where x.org_id = o.id and x.name = 'The real monthly partner list');
insert into public.hub_collateral (org_id, practice_id, name, owner, due_date, status, blocks, sort)
select o.id, o.practice_id, 'A named brunch host', 'Kendra', null, 'missing', 'the guest list, the invitations, and the whole November event', 5
from public.hub_orgs o
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_collateral x where x.org_id = o.id and x.name = 'A named brunch host');

delete from public.hub_tasks t using public.hub_orgs o
where o.id = t.org_id and o.slug = 'epayl' and t.done_at is null and t.source = 'manual'
  and t.title in ('Ask O’Hara to renew the $25,000', 'Ask Brandon for three referral names', 'Thank the Butchers properly for the $50,000', 'Count the monthly donors', 'Set the brunch date and pick the host', 'Pick 12 names off the prospect list');

insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Write down the O’Hara condition', 'Whatever was attached to the first $25,000. They have now given twice and it still exists only in Kendra’s memory.', 'Kendra', 'This week', 'Major gifts', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'major-gifts'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Write down the O’Hara condition');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Thank the Butchers properly', 'Handwritten, plus a one-page report on what the $50,000 did. Before any second ask.', 'Kendra', 'This week', 'Major gifts', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'major-gifts'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Thank the Butchers properly');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask the Butchers to renew the $50,000', 'In person. Now the biggest single renewal left on the board.', 'Kendra', 'By October 15', 'Major gifts', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'major-gifts'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask the Butchers to renew the $50,000');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask Brandon for three names', 'He offered. Ask for names and permission to use his name.', 'Kendra', 'By October 10', 'Major gifts', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'major-gifts'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask Brandon for three names');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Pick 12 prospects to research', 'Twelve is a real number of intro conversations for one fall. A hundred is not.', 'Kendra and Remi', 'By October 1', 'Major gifts', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'major-gifts'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Pick 12 prospects to research');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask Young to renew, asked up', '$3,000 to $5,000 if the two records turn out to be one family.', 'Kendra', 'By December', 'Major gifts', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'major-gifts'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask Young to renew, asked up');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Get an email address for the Allens', 'Two $10,000 gifts and no email on file. Everything has to go through Kendra personally until that is fixed.', 'Remi', 'This month', 'Major gifts', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'major-gifts'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Get an email address for the Allens');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Get the real list from the region', 'You cannot ask people to upgrade if you do not know what they give.', 'Remi', 'September', 'Monthly partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'monthly'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Get the real list from the region');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask Nathan Frank why he gives', 'He has given 148 times. His reason, in his words, is the best recruiting line you will get.', 'Kendra', 'September', 'Monthly partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'monthly'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask Nathan Frank why he gives');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Add a monthly option to every ask', '$50 a month instead of $600 once. Same money, easier yes, and it renews itself.', 'Kendra', 'October', 'Monthly partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'monthly'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Add a monthly option to every ask');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask every leader parent once', 'Parents of kids in the ministry are the most natural monthly partners and the least asked.', 'Kendra', 'November', 'Monthly partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'monthly'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask every leader parent once');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Thank monthly partners by name', 'A short note with one story. Monthly partners quit when they feel like a bank transfer.', 'Remi', 'Quarterly', 'Monthly partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'monthly'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Thank monthly partners by name');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Pick the host', 'The single most important decision in this strategy.', 'Kendra', 'This week', 'The fall brunch', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'brunch'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Pick the host');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Set the date', 'Early November, weekday late morning. Avoid Thanksgiving week.', 'Kendra', 'This week', 'The fall brunch', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'brunch'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Set the date');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Build the guest list', 'Twenty names to get fifteen in the room. The host owns the list.', 'Host and Kendra', 'Late September', 'The fall brunch', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'brunch'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Build the guest list');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Send invitations', 'Paper or a personal note, not a mass email. Four weeks of lead time.', 'Host', 'Early October', 'The fall brunch', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'brunch'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Send invitations');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Rehearse the ask', 'Out loud, twice. Ninety seconds, once, near the end. The ask is the part everybody skips practicing.', 'Kendra and Remi', 'Late October', 'The fall brunch', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'brunch'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Rehearse the ask');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Follow up with every guest', 'Whether they gave or not.', 'Remi drafts, Kendra signs', 'Within 48 hours', 'The fall brunch', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'brunch'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Follow up with every guest');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'List every connected church', 'Ask the leaders where they go. That is the list.', 'Kendra', 'By October', 'Church partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'churches'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'List every connected church');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask for a speaking slot, not money', 'Five minutes in front of the congregation, or a table after the service.', 'Kendra', 'Fall', 'Church partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'churches'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask for a speaking slot, not money');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask for one line in the mission budget', 'Church budgets get set months ahead. Missing the calendar means waiting a year.', 'Kendra', 'Winter', 'Church partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'churches'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask for one line in the mission budget');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask for leaders too', 'A church that sends two volunteer leaders is worth more than one that sends $2,500.', 'Kendra', 'Ongoing', 'Church partners', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'churches'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask for leaders too');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Confirm the Young Life grant repeats', 'And find out what it requires. It is the only grant on record.', 'Remi', 'September', 'Grants', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'grants'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Confirm the Young Life grant repeats');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask O’Hara how his foundation decides', 'About $8M in assets. Separate conversation from the personal gift, never the same meeting.', 'Kendra', 'After the renewal', 'Grants', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'grants'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask O’Hara how his foundation decides');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Ask Brandon whether his foundation is the right door', 'Over $500M in assets. He may say no, and that is useful.', 'Kendra', 'Fall', 'Grants', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'grants'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Ask Brandon whether his foundation is the right door');
insert into public.hub_tasks (org_id, practice_id, title, why, owner, due_label, area, strategy_id, source)
select o.id, o.practice_id, 'Research three local funders', 'Two hours. Pick three that fund youth work in San Mateo County.', 'Grant research', 'By November', 'Grants', st.id, 'manual'
from public.hub_orgs o
join public.hub_strategies st on st.org_id = o.id and st.slug = 'grants'
where o.slug = 'epayl'
  and not exists (select 1 from public.hub_tasks t where t.org_id = o.id and t.title = 'Research three local funders');
