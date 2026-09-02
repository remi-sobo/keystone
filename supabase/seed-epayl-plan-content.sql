-- The EPA plan content seed (specs/epayl-fundraising-hub.md, phase
-- three). Every row here is extracted mechanically from the design
-- reference (docs/handoff/epayl/fundraising-hub.dc.html), whose copy
-- is final; nothing is authored here. Idempotent: each owned section
-- is replaced wholesale, so re-running refreshes it, and no other
-- section is touched.

update public.hub_strategies s set goal_cents = 13000000, goal_trust = 'stated', next_move = coalesce(s.next_move, null)
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'major-gifts';
update public.hub_strategies s set goal_cents = 1800000, goal_trust = 'stated', next_move = coalesce(s.next_move, null)
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'monthly';
update public.hub_strategies s set goal_cents = 1500000, goal_trust = 'stated', next_move = coalesce(s.next_move, null)
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'brunch';
update public.hub_strategies s set goal_cents = 1000000, goal_trust = 'stated', next_move = coalesce(s.next_move, null)
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'grants';
update public.hub_strategies s set goal_cents = 500000, goal_trust = 'stated', next_move = coalesce(s.next_move, null)
from public.hub_orgs o where o.id = s.org_id and o.slug = 'epayl' and s.slug = 'churches';

-- Owned content sections, replaced wholesale.
delete from public.hub_content_blocks b using public.hub_orgs o
where o.id = b.org_id and o.slug = 'epayl' and b.section in ('plan-strands', 'plan-gift-table', 'money-unsettled', 'strategy', 'work-calendar', 'stewardship');

insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'plan-strands', null, 'lead', '{"text":"The plan names seven strands. Five of them are the strategy cards above; the middle band of gifts and the spring family fundraiser live here until they get a home."}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'plan-strands', null, 'table', '{"columns":["Strand","Plan figure","The read"],"rows":[["Big gifts, $10,000 and up","$130,000","Four households did $102,000 last year. This is where the year is won or lost."],["Gifts between $1,000 and $9,999","$27,000","The middle of the list. Thin right now."],["Monthly giving","$18,000","Roughly six households give monthly today. Nobody has counted them properly."],["Fall brunch","$15,000","Early November. Fifteen women in a room."],["Spring family fundraiser","$6,000","Be a Kid for a Day, early April."],["Grants and foundations","$10,000","One $10,000 Young Life grant is the only thing here so far."],["Churches","$5,000","Nothing committed. Relationships exist and have never been asked."]]}', 1
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'plan-gift-table', null, 'lead', '{"text":"55 gifts across seven levels get to the goal. Names needed means three real candidates per intended gift, because not everyone says yes."}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'plan-gift-table', null, 'table', '{"columns":["Level","Gifts needed","Named so far","Where they come from"],"rows":[["$50,000","1","1","Butcher renewal. Everything else in the plan assumes this one repeats."],["$25,000","2","2","O’Hara renewal, and Brandon asked up from $17,000."],["$10,000","3","1","Allen renewal, plus two new households. One should come from a Brandon introduction."],["$5,000","6","1","Young asked up from $3,000, plus five new. The brunch and the prospect list both feed this row."],["$2,500","6","0","Nobody yet. Churches and brunch guests are the most likely source."],["$1,000","12","0","The newsletter list and the spring event. Twelve at a thousand is a real target, not a stretch."],["Under $1,000","25","6","Monthly donors and the small-gift crowd. Six households already give here every year."]]}', 1
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'money-unsettled', null, 'table', '{"columns":["The number","How well we know it","The story"],"rows":[["Second staff position, $35,000","Placeholder","We invented this number. Kendra said part time starting around August of year two and that housing does not change the pay. Nobody has said what part time means in hours or dollars. It is the largest unconfirmed number in the budget."],["Getting kids to camp, $0","Not priced","Kids carpool today. Kendra wants a shared bus with other Peninsula areas and floated $5,000 a year. Until that is priced, the camp number is low."],["Technology and mileage, $0","Not priced","Kendra says about $2,000 covers mileage and the phone bill, and that some tech is already inside the service charge. Gas is roughly $200 a month, untracked. Young Life covers her $118.48 phone bill as a full-time employee."],["Cash on hand, $28,295","Stated","Kendra’s number, $28,294.76, with about $10,000 more expected from capital. She says the split between restricted and usable is handled at the region and she cannot see it."],["The fiscal year is October to September","Settled","Kendra chose the region’s calendar over the school year. The budget tabs were built on August to July, so the month columns are shifted by two."],["Camp rates","Verified","$750 per kid at Woodleaf June 19 to 23, $175 per kid for weekend camps. Both confirmed by Kendra. All-in cost per kid at camp is $1,290."]]}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"Monthly gifts are the only money you can count on before it arrives. Right now about six households give monthly and nobody knows the exact total. Fix the counting first, then grow it."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The target"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'cards', '{"cards":[{"tag":"Today","value":"6 households","title":"Roughly $1,500 a year","note":"Best guess from the donor file. Frank at about $100 a month and Taylor at about $51 are the two clearest."},{"tag":"This year","value":"30 households","title":"$18,000 a year","note":"Thirty households at an average of $50 a month. That is one recruiting conversation a week for a year."},{"tag":"Why it matters","value":"9%","title":"Of the whole goal","note":"Predictable money means you stop guessing about January."}]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"How to get there"}', 3
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Step","When","What happens","Who owns it"],"rows":[["Get the real list from the region","September","Exact names, exact amounts, exact dates. You cannot ask people to upgrade if you do not know what they give.","Remi"],["Ask Frank why he gives","September","He has given 148 times. His reason, in his words, is the best recruiting line you will get.","Kendra"],["Add a monthly option to every ask","October","$50 a month instead of $600 once. Same money, easier yes, and it renews itself.","Kendra"],["Ask every leader parent once","November","Parents of kids in the ministry are the most natural monthly donors and the least asked.","Kendra"],["Thank monthly donors by name","Quarterly","A short note with one story. Monthly donors quit when they feel like a bank transfer.","Remi"]]}', 4
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"One thing to avoid"}', 5
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'paragraph', '{"text":"Do not put the monthly total in the goal until the list is verified. A number you assumed is worse than a blank, because you will plan around it."}', 6
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'monthly';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"Early November. Fifteen women in a room, hosted by one of them. Budget is $2,500 and the target is $15,000. The host matters more than the venue and the invitation matters more than the program."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The shape of the day"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Piece","Target","What it is","Notes"],"rows":[["Guests","15 women","Invited by the host, not by the ministry. A personal invitation from a peer is what fills the room.","Aim for 20 invitations to get 15 in the room."],["Average gift","$1,000","Fifteen guests at an average of $1,000 gets you to $15,000. Some will give $5,000, most will give less.","Do not set a minimum. It shrinks the room."],["The ask","90 seconds","One person asks, once, clearly, near the end. Everyone leaves with a card and a way to give.","Kendra asks. Nobody else."],["The story","5 minutes","One story about one kid, told with permission. No slideshow, no statistics.","Written parental consent before any kid is named."],["Follow-up","48 hours","Every guest gets a note within two days, whether they gave or not.","Remi drafts, Kendra signs."]]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"What has to happen first"}', 3
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Task","Deadline","Detail","Owner"],"rows":[["Pick the host","This week","A woman with a home, a network, and a real belief in this ministry. She invites, she opens the room, she gives first.","Kendra"],["Set the date","This week","Early November, weekday late morning. Avoid the week of Thanksgiving.","Kendra"],["Build the guest list","Late September","Twenty names. The host owns the list. Prospect list names can be added if the host knows them.","Host and Kendra"],["Send invitations","Early October","Paper or a personal note, not a mass email. Four weeks of lead time.","Host"],["Rehearse the ask","Late October","Out loud, twice. The ask is the part everybody skips practicing.","Kendra and Remi"]]}', 4
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'brunch';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"One $10,000 Young Life grant is the only thing here so far. Grants are slow and they are not a rescue plan. What makes them worth working is that three of last year’s donors are already connected to foundations."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"What is on the board"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Source","Amount","Status","Next step"],"rows":[["Young Life area grant","$10,000","Received. This is the only grant money on record.","Confirm whether it repeats this year and what it requires."],["Foundation connected to the O’Hara household","About $8M in assets","Not approached. Shows up in the donor file, not from a conversation.","Ask John how the foundation makes decisions. Do not pitch it in the renewal meeting."],["Foundation connected to the Brandon household","Over $500M in assets","Not approached. Large and probably has its own process.","Ask him whether it is even the right door. He may say no, and that is useful."],["Foundation connected to the Allen household","Large fund on record","Not approached.","Research only. No ask this year."],["Local Peninsula funders","Unknown","Not researched.","Two hours of research. Pick three that fund youth work in San Mateo County."]]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The rule for this year"}', 3
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'paragraph', '{"text":"Do not write a grant proposal to a foundation where nobody knows anybody. Cold grant writing is the slowest fundraising there is. Start with the three foundations already connected to your donors, and ask the donor how the door opens."}', 4
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'grants';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'lead', '{"text":"Nothing is committed from a church today. The relationships exist and have never been asked. Church money is usually smaller than a major gift and steadier than an event."}', 0
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'churches';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"How to work it"}', 1
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'churches';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'table', '{"columns":["Step","Target","What it looks like","Owner"],"rows":[["List every church already connected","By October","Any church where a leader, a family, or a committee member attends. Start with the people, not the buildings.","Kendra"],["Ask for a speaking slot, not money","Fall","Five minutes in front of the congregation, or a table after service. Money follows being known.","Kendra"],["Ask for one line in the mission budget","Winter","Church budgets get set months ahead. Missing the calendar means waiting a year.","Kendra"],["Ask for leaders too","Ongoing","A church that sends two volunteer leaders is worth more than one that sends $2,500.","Kendra"]]}', 2
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'churches';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'headline', '{"text":"The target"}', 3
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'churches';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'strategy', s.id, 'cards', '{"cards":[{"tag":"This year","value":"$5,000","title":"From two or three churches","note":"Small on purpose. Nothing is committed, so a big number here would be fiction."},{"tag":"The real prize","value":"Leaders","title":"Six volunteer leaders is the plan","note":"Churches are the most reliable place to find adults who will show up every week."}]}', 4
from public.hub_orgs o, public.hub_strategies s
where o.slug = 'epayl' and s.org_id = o.id and s.slug = 'churches';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'work-calendar', null, 'lead', '{"text":"The year runs October through September. Expenses are known because the camp dates and the ministry calendar are set. Income timing is up to you, which is what this page is for. Money has to arrive before it is spent, not in the same month."}', 0
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'work-calendar', null, 'headline', '{"text":"Month by month"}', 1
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'work-calendar', null, 'table', '{"columns":["Month","Cash out","What drives it","What has to be raised or asked"],"rows":[["October","$18,208","College weekend camp. First full month of program.","O’Hara renewal ask. Brunch invitations out. Butcher thank-you and report."],["November","$18,257","Brunch costs land this month.","The brunch itself. Target $15,000. Ask the Brandon referrals."],["December","$13,212","Program slows for the holidays.","Year-end appeal to the whole list. December is the biggest giving month of the year everywhere."],["January","$27,362","House capital work and a full program month.","Close anything that slipped from the fall. Start monthly donor recruiting in earnest."],["February","$28,177","WyldLife weekend camp February 13 to 15, plus capital.","Camp-specific asks. Camp gifts skip the 17 percent if the donor writes camp on the gift."],["March","$17,821","Woodleaf deposits begin.","Second half of the big-gift asks. Grant research turns into two real conversations."],["April","$19,459","Spring family fundraiser costs.","Be a Kid for a Day. Target $6,000. Kids raising their own camp money starts here."],["May","$17,316","Woodleaf balance coming due.","Final camp gap ask. Fifteen kids at $750 each, minus what the kids raise."],["June","$15,110","Woodleaf June 19 to 23. The biggest single spend of the year.","Nothing new. This month is for showing up with kids."],["July to September","$11,240 a month","Staff pay and the house only.","Report to every donor. Set next year’s plan in August, not September."]]}', 2
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'work-calendar', null, 'headline', '{"text":"The thing to watch"}', 3
from public.hub_orgs o
where o.slug = 'epayl';
insert into public.hub_content_blocks (org_id, practice_id, section, strategy_id, kind, payload, sort)
select o.id, o.practice_id, 'work-calendar', null, 'paragraph', '{"text":"The bank holds $28,295 on day one and the first three months cost $44,000. So money has to come in during October and November or the area is borrowing against itself by December. That is the whole argument for asking O’Hara early and running the brunch in early November rather than late."}', 4
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
select o.id, o.practice_id, 'stewardship', null, 'table', '{"columns":["Gift size","How often","What they get","Who does it"],"rows":[["$10,000 and up","6 times a year","A handwritten thank-you inside a week. A call from Kendra twice a year. One in-person visit. A one-page report on what the gift did.","Kendra"],["$1,000 to $9,999","4 times a year","A thank-you inside two weeks with one specific detail about what the money covered. The newsletter. One personal note that is not an ask.","Kendra"],["Monthly donors","Every quarter","A short note with one story. An annual total for taxes. Never an ask disguised as a thank-you.","Remi"],["Under $1,000","3 times a year","A thank-you inside two weeks. The newsletter. A year-end note.","Remi"],["Brunch and event guests","Twice","A note within 48 hours, whether they gave or not. One follow-up in the spring.","Remi drafts, Kendra signs"]]}', 2
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

update public.hub_content_blocks b set payload = '{"columns":["What is not settled","Who owns it","What the plan assumes meanwhile"],"rows":[["The wordmark''s exact wording","Remi","The handoff names So Loved in gold; the full campaign name is not in the bundle. The header shows the org name with So Loved until this is corrected in the vocabulary row."],["Weekly hours for church partners and grants","Remi and Kendra","Major gifts, brunch, and monthly have stated hours. The other two do not, so the hours total under Work reads lower than the real ask."],["Where the middle band and the spring fundraiser live","Remi","The plan names seven strands; the strategy cards carry five. Gifts between $1,000 and $9,999 ($27,000) and the spring family fundraiser ($6,000) are in the strands table without a card."],["The fiscal year","Kendra","The budget workbook models August through July and the answer sheet says October through September. The hub runs October through September until corrected, and the cash calendar shows the months as the workbook models them."]]}'
from public.hub_orgs o
where o.id = b.org_id and o.slug = 'epayl' and b.section = 'plan-open-questions';
