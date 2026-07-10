-- Library additions and upgrades (2026-07-10, adapted from bootcamp
-- material Remi brought in; all prose original, in the SOBO voice, for
-- nonprofits). Three new guides (making the ask, the funding
-- rationale, questions that move the conversation) and three upgrades
-- (the meeting guide gains the open and the ladder, donor journeys
-- gains start-with-who-you-have, the AI guide gains funder research).
-- Idempotent: inserts guard on title, updates replace whole bodies.

-- New guide: Making the ask

with p as (select id from practices where slug = 'sobo')
insert into resources (practice_id, title, kind, body_md, tags)
select p.id, 'Making the ask', 'guide',
$g$Most fundraising fails before the ask or after it, rarely during. This guide is about getting TO a real ask, making it cleanly, and knowing it happened.

## What counts as an ask
All four, or it was not an ask:
1. You were together, one to one, in person or on video.
2. You made a specific request: a program, a project, or a number.
3. There was a conversation about it, not a monologue.
4. You expect a yes or a no.
A mailed letter is outreach. A hint is a hope. An ask is the four above.

## A great ask has two parts
The request, and the reason. "Would you consider $15,000?" is half an ask. "Would you consider $15,000? That funds three young people through a full year of the program" is a whole one. The reason the number is the number lives in its own guide: Why this number.

## The ladder
Not every visit ends in an ask, and it should not. Every visit ends one rung higher:
1. Alignment: you learn whether they care about this work at all.
2. Permission: "Next time, I would love to talk about ways you could get invested. Does that work?"
3. The roadmap: "Would you consider funding part of this plan?" Said directly, so the real conversation happens while you are in the room.
4. The ask itself: the specific request with its reason.
Know which rung you are on before you walk in, and aim one higher.

## Two clean ways to say it
- The direct ask: "Would you consider [the number], which does [the impact]?" Then quiet. The silence after an ask belongs to them.
- The open plan: show the funding plan for the year and ask, "Where do you see yourself in this?" It respects their judgment, and people often place themselves higher than you would have dared.

## Three ways anyone can help
When someone asks "how can I help?", have three answers ready: champion the work (speak for it), connect (bring one person in), give. Every yes is a yes; money is only one of the doors.$g$,
array['fundraising','ask']
from p
where not exists (select 1 from resources r, p where r.practice_id = p.id and r.title = 'Making the ask');

-- New guide: Why this number (the funding rationale)

with p as (select id from practices where slug = 'sobo')
insert into resources (practice_id, title, kind, body_md, tags)
select p.id, 'Why this number: the funding rationale', 'guide',
$g$Funders say yes to a clear request with an honest reason behind it. The funding rationale is that reason: invest X, and on average it does Y. This guide is how to build one.

## The shape
One sentence: "We need X because it will do Y." If you cannot fill in that sentence for a request, the request is not ready.

## Do the unit math
Break the work into a unit a funder can hold, then cost it honestly:
- What does one young person's year in the program cost, all in?
- What does one workshop, one cohort, one campaign cost, and what does each one produce?
Then say it plainly: "$1,500 funds one young person's spring semester." The giving-tree play is exactly this: a share of one kid's journey, priced honestly.

## When the real impact is long term
You cannot measure a whole life from here. Use an honest proxy:
- Track the outcome you CAN see (program completion, first placements, skills demonstrated) and pair it with published research that links your proxy to the long arc.
- Say both parts out loud: "we measure this, and the research says it leads to that."
Funders respect a measured proxy plus honest reasoning far more than a grand claim with nothing under it.

## Operations are impact too
Salaries, rent, and systems are not a lesser category. Repackage them as what they do: "this role holds the weekly rhythm for forty students" beats "unrestricted operating support" every time. If money keeps the work standing, say what the work is.

## Show your math
Put the arithmetic in the conversation, rounded and honest, and never hide the assumptions. "The numbers vary by kid and by year, and here is the average" builds more trust than false precision. A funder who checks your math and finds it fair is a funder who stays.

## This week
Pick your most common request. Write its rationale sentence and the unit math beneath it. Read it to someone outside the organization; if they cannot repeat the reason back, tighten it.$g$,
array['fundraising','strategy']
from p
where not exists (select 1 from resources r, p where r.practice_id = p.id and r.title = 'Why this number: the funding rationale');

-- New guide: Questions that move the conversation

with p as (select id from practices where slug = 'sobo')
insert into resources (practice_id, title, kind, body_md, tags)
select p.id, 'Questions that move the conversation', 'guide',
$g$The person asking questions is steering. In a funding conversation you want three kinds in your pocket, used in roughly this order.

## Discovery: learn their world
Use these to hear their words, their interests, and their hesitations before you present anything.
- "What do you already know about us?" Then build on their answer instead of starting from zero.
- "What has been the best gift you have ever made, and what made it that?"
- "You give a lot of thought to where you invest. What matters most to you this year?"
- "How would you describe us to a friend?" Their words become your best language.

## Alignment: check before you advance
Short questions that confirm you are still together, and invite them in when you are not.
- "Does this make sense so far?"
- "Tell me more" when they push back. A hesitation explored is worth ten nods.
- The agenda check that sets up everything: "Today I would love to share where the work is going, see if it connects with what you care about, and if it does, talk about ways you could help. Does that work?"
Talk less than they do. If you have been talking for two minutes straight, stop and hand them a question.

## Action: ask for something answerable
Questions a person can answer with yes or no.
- "Can we talk about ways you can help?"
- "Would you introduce me to the two people you think should know about this?"
- "Would you consider [the number], which does [the impact]?"

## The habit
Before every visit, write one question of each kind at the top of your prep note. After the visit, write down the best question THEY asked you; it tells you what they are weighing.$g$,
array['fundraising','meetings']
from p
where not exists (select 1 from resources r, p where r.practice_id = p.id and r.title = 'Questions that move the conversation');

-- Upgrade: How to run a fundraising meeting

update resources set body_md = $g$A fundraising meeting is won before it starts and sealed after it ends. The middle is the easy part, if you let them do most of the talking.

## Prepare
1. Know them. Giving history, connection to you, what they care about, who they know. Ten minutes of homework beats an hour of improvising.
2. Set the goal for THIS meeting. Not every meeting is an ask; every meeting ends one rung higher (see Making the ask). Write one sentence: "This meeting is a win if..."
3. Bring one thing. A one-pager, a story, a number. One, not five.

## The open
Script your first two minutes and practice them out loud. The reflex to resist is the info dump: nobody was ever moved by a recited elevator pitch. Instead, start from what they already hold: "Before I say anything, what do you know about us?" Build on their answer. Set the agenda together: "I would love to share where the work is going, see if it connects with what you care about, and if it does, talk about ways you could help. Does that work?" Now the whole meeting has permission.

## Execute
1. Listen seventy percent of the time. Ask what drew them to the work. Ask what they want to see. People fund what they helped shape.
2. Tell one true story about one young person. Then one number that shows the scale. Story first, number second. Lead with the impact; the money conversation follows it naturally, never the other way around.
3. Listen for "how can I help?" It is the door opening. If it does not come, open it yourself: "Can we talk about ways you can help?"
4. End with a clear next step, said out loud: "I will send you the one-pager Monday, and I would love to have you at Campus in March." No meeting ends without a next step.

## Follow up
Within twenty-four hours, a short personal note. What you heard them say, the next step, thank you. Handwritten beats email when the relationship matters.

## Debrief
Before the day ends, write three lines:
- Likelihood: are they moving toward a gift, holding, or cooling?
- Giving potential: what could this relationship become?
- Possible ask: what number, and when?
Log it while it is fresh. The debrief is where meetings turn into strategy.$g$
where practice_id = (select id from practices where slug = 'sobo') and title = 'How to run a fundraising meeting';

-- Upgrade: Donor journeys

update resources set body_md = $g$Every donor is on a journey with you, whether you are steering it or not. This guide makes you the one steering.

## The two motions, both every week
Cultivation moves someone toward a gift. Stewardship honors the gift they already made. Most organizations do one or the other in bursts. You will do both, every week, in small amounts. A thank-you call is stewardship. A coffee to share what is next is cultivation. Neither is an ask.

## The one rule
The ask is never a surprise. By the time you ask, the donor should already know your work, your numbers, and roughly what you will ask for, because you told them along the way. If an ask would surprise them, you are not ready to make it.

## Start with who you already have
Before chasing new names, check each current funder against three marks:
1. Have we sat with them one to one, in person or on video, in the last year?
2. Have they heard the big why from us, not just program updates?
3. Have we ever actually asked how they want to help?
A current funder missing any of the three is your warmest work. New names wait until the people who already said yes are fully met.

## The quarterly touch
Every donor you care about hears from you at least once a quarter, and not always with your hand out. A report, a story, an invitation, a thank you. Map it: for each top donor, write the next two touches and put dates on them.

## Build a journey in five steps
1. Pick the donor. Start with your top ten.
2. Write where they are today: first gift, repeat gift, lapsed, prospect.
3. Write where you believe they could be in a year. Be specific about the number.
4. List the three to five touches between here and there. Mix stewardship and cultivation.
5. Put the first touch on your calendar this week. The journey starts when the first touch lands, not when the plan is written.

## This week
Run the three-mark check on your five biggest current funders. Then pick one donor, write their journey, and make the first touch before Friday.$g$
where practice_id = (select id from practices where slug = 'sobo') and title = 'Donor journeys';

-- Upgrade: AI in the daily workflow

update resources set body_md = $g$AI is a strong assistant and a poor decision-maker. Use it to clean up your thinking. Never let it do the thinking.

## Where it earns its keep
- First drafts: outreach notes, newsletter sections, thank-you letters. You edit until it sounds like you, because donors give to you, not to a model.
- Summaries: paste your own meeting notes and ask for the three next steps.
- Prep: "What would a foundation program officer ask about this program?" is a good rehearsal.
- Unsticking: when a blank page stalls you, ask for three rough openings and rewrite the best one.

## Finding funders with it
The research models are genuinely good at prospect work. The method:
1. Widen your cause words. Ask it to list every way a funder might categorize your work: youth development, mental health, mentorship, place-based, education equity. Funders file the same work under different words; you want to be findable under all of them.
2. Look sideways at peers. Name three or four organizations doing adjacent work and ask who funds them: foundations, families, corporations. Peer funders already believe in your cause.
3. Go deep on the shortlist. For each promising name, ask for their giving history, stated interests, and public contact paths, and tell it to exclude the famous mega-donors so the list is people who might actually take your call.
4. Verify everything before it enters your pipeline. Research models fabricate confidently; a name goes in your CRM only after you have checked it yourself.

## The rules
1. It drafts. You decide. Nothing goes out unread, and nothing goes out that you would not say in person.
2. It never sends on its own. No auto-replies, no scheduled sends you did not read that day.
3. Watch what you paste. Donor personal details, staff matters, and anything confidential stay out of tools we have not cleared. Names can usually be swapped out before pasting and back in after.
4. Facts get checked. Models are confident and sometimes wrong. Every number, name, and date in a draft gets verified by you.

## The habit
Use it daily for the small stuff and it buys you an hour; that hour goes to touches, calls, and the work only a person can do. The tool handles polish. You handle relationships.$g$
where practice_id = (select id from practices where slug = 'sobo') and title = 'AI in the daily workflow';
