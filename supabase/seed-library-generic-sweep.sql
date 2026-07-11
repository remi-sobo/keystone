-- The library generic sweep (2026-07-11, on Remi's ask). The catalog
-- is practice-wide by design (spec 5.1: one shared shelf, every client
-- member of the practice reads the client-audience rows), but the
-- guide bodies were written mid-engagement and carried SafeSpace
-- material: the client's own messaging angles, its donor-base size,
-- its program names, and one of its lived lessons. This file rewrites
-- nine bodies so every guide reads as SOBO IP for any nonprofit
-- client. Nothing is lost: each removed detail already lives in the
-- engagement record (the July 7 session note and decision log, the
-- seed doc, homework item 4), which is walled to SafeSpace. The audit
-- and the where-each-detail-lives table are in
-- docs/library-generic-sweep.md.
--
-- Layered after seed-library-guides.sql and seed-library-additions.sql
-- (the checked-in history of what was entered stays untouched, per the
-- additions precedent). Idempotent by nature: each statement replaces
-- one whole body by title. CAUTION for live runs: these updates
-- replace whole bodies, so they would clobber any in-app edit made at
-- /library/authoring since the additions were entered; check
-- resources.updated_at before applying.
--
-- Unchanged (already generic): Donor journeys, The weekly fundraising
-- rhythm, Questions that move the conversation. Deliberately NOT swept:
-- 'Planned deliverables: the SafeSpace ledger' is engagement material
-- pinned in the library until planned deliverables have a first-class
-- home; it is client-named on purpose and tracked in CURRENT.md.

-- Messaging angles: was SafeSpace's actual angle set (the client name,
-- the Youth Action Board, the peninsula, the grandparent and parent
-- framings). Now the method for deriving your own.

update resources set body_md = $g$You have one true story. Different hearts hear it differently. The work is matching the angle to the listener, never changing the facts.

## Find your three angles
Your work is one thing, but funders file it under different headings. Write down the three facets of your mission that different audiences care about most. A youth program might carry a wellbeing angle, a leadership angle, and a rooted-in-this-place angle; a food bank might carry hunger, dignity, and neighborhood. The test of a real angle: it is the same true work, seen from where one listener stands.

## How to choose
Before any meeting, letter, or application, ask: what does this person already care about? Pick the angle that meets them there. If you do not know, lead with the story of one person your work changed and watch what lands.

## The rules
- Accurate always. Every angle is the same true work. If an angle needs stretching to fit a funder, it is the wrong funder or the wrong angle.
- One angle at a time. A pitch that tries all three lands as none.
- The one-sentence test: after choosing the angle, say the work in one sentence to someone outside the organization. If they can repeat it back, it works.

## This week
Name your three angles. Write the two-sentence version of each. Read them out loud. Keep them where you plan your touches.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'Messaging angles';

-- Segmenting the base: the opening carried SafeSpace's donor-base size
-- (about 1,200 contacts, a client fact from the July 7 call, kept in
-- the engagement record); the examples read youth-specific.

update resources set body_md = $g$A big list where most names give little or nothing is not a problem. It is a base waiting for a strategy that fits each layer.

## The 90/10 cut
Roughly ten percent of your base will give ninety percent of the money. The cut tells you where hours go: custom work up top, warm systems below. Hours are the scarcest thing you have; segmentation is how you spend them honestly.

## The top tier
Your top twenty to forty donors and prospects each get a journey (see Donor journeys): a named owner, a next touch with a date, a possible ask. This is where meetings, visits, and hand-written notes live.

## The middle
Past donors and warm contacts who are not top tier get consistent, personal-feeling systems: the newsletter, two or three warm letters a year, an honest annual ask, a real thank you. Personal-feeling is the bar; hand-crafted is not required.

## The broad base
Everyone else gets the giving-tree play: a simple, concrete way to fund a visible share of the work, one person's year in the program, one workshop, one week. Program-cost framing works here because it makes a small gift feel like what it is, a real piece of the real thing.

## Keep it honest
- Segments are about strategy, never worth. Every giver belongs on the tree.
- Revisit the cut quarterly. Donors move up when the relationship warms, and that is the whole game.
- If a name has no segment, it has no strategy. Sort the unsorted first.

## This week
Pull the list. Mark your top twenty by relationship and capacity, not just last year's gift. That is the first cut.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'Segmenting the base';

-- How to run a fundraising meeting: the example next step named Campus,
-- a SafeSpace program; the story line read youth-specific. Body
-- otherwise the additions version.

update resources set body_md = $g$A fundraising meeting is won before it starts and sealed after it ends. The middle is the easy part, if you let them do most of the talking.

## Prepare
1. Know them. Giving history, connection to you, what they care about, who they know. Ten minutes of homework beats an hour of improvising.
2. Set the goal for THIS meeting. Not every meeting is an ask; every meeting ends one rung higher (see Making the ask). Write one sentence: "This meeting is a win if..."
3. Bring one thing. A one-pager, a story, a number. One, not five.

## The open
Script your first two minutes and practice them out loud. The reflex to resist is the info dump: nobody was ever moved by a recited elevator pitch. Instead, start from what they already hold: "Before I say anything, what do you know about us?" Build on their answer. Set the agenda together: "I would love to share where the work is going, see if it connects with what you care about, and if it does, talk about ways you could help. Does that work?" Now the whole meeting has permission.

## Execute
1. Listen seventy percent of the time. Ask what drew them to the work. Ask what they want to see. People fund what they helped shape.
2. Tell one true story about one person your work serves. Then one number that shows the scale. Story first, number second. Lead with the impact; the money conversation follows it naturally, never the other way around.
3. Listen for "how can I help?" It is the door opening. If it does not come, open it yourself: "Can we talk about ways you can help?"
4. End with a clear next step, said out loud: "I will send you the one-pager Monday, and I would love to have you at the spring showcase." No meeting ends without a next step.

## Follow up
Within twenty-four hours, a short personal note. What you heard them say, the next step, thank you. Handwritten beats email when the relationship matters.

## Debrief
Before the day ends, write three lines:
- Likelihood: are they moving toward a gift, holding, or cooling?
- Giving potential: what could this relationship become?
- Possible ask: what number, and when?
Log it while it is fresh. The debrief is where meetings turn into strategy.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'How to run a fundraising meeting';

-- Multi-year giving: "We have lived this one" pointed at SafeSpace's
-- own too-early ask (Susan's experience, seed doc section 9), which in
-- a shared catalog reads as the practice's story and quietly carries a
-- client's. The lesson stays; the attribution generalizes.

update resources set body_md = $g$A yearly gift renewed three times is good. A three-year commitment is better, and not just for the total: it lets you plan, and it deepens the donor's stake in the work.

## Why multi-year matters
- You can hire, build, and promise against committed money.
- Retention does the compounding: a donor who commits for three years stays close for three years.
- The conversation itself elevates the relationship from transaction to partnership.

## When to ask
Ask when all three are true:
1. They have given at least twice, consistently.
2. The relationship is warm: they take your calls, they have seen the work.
3. There is a moment: a milestone, a new initiative, or their own expressed excitement.

## When it is too early
If the relationship has not earned it, the ask reads as pressure and can cost you the yearly gift you already had. Plenty of organizations have lived this one. If you find yourself building the case for why they MIGHT say yes, it is too early. Wait, steward, and ask next year.

## How to frame it
"You have been with us two years, and it has mattered. Would you consider making that commitment for the next three? It lets us plan around you." Specific number, specific term, then quiet.

## After the yes
A multi-year donor is a partner. They hear results first, get the honest picture in hard moments, and are never taken for granted just because the pledge is signed.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'Multi-year giving';

-- Foundations versus individuals: one youth-specific story line.

update resources set body_md = $g$Foundations and individuals fund the same work for different reasons, on different clocks. Treat them the same and you will lose both.

## How institutions think
A foundation funds fit: your work matching their stated priorities, on their timeline, with their reporting. The program officer has a board too, and your job is to make their case for them easy.
- Read the guidelines twice before a word gets written. Fit or do not apply.
- Deadlines and report dates go on the calendar the day you learn them.
- The relationship still matters: a fifteen-minute call with a program officer before applying is worth more than a polished cold proposal.

## How individuals think
A person funds belonging: the feeling that this work is theirs too. They move on story, trust, and being remembered.
- The story of one person your work changed beats the annual report.
- They notice how you thank, not just whether.
- Their clock is emotional, not fiscal. A December ask lands differently than a March one.

## The ask differs
- Institutions: a written request for a specific amount against a specific budget, in their format.
- Individuals: a conversation, a specific number said out loud, and then quiet while they think.

## What stays the same
Both are journeys. Both need the ask to never be a surprise. Both deserve stewardship after the yes, because the second gift starts the day the first one lands.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'Foundations versus individuals';

-- Making the ask: the example impact line read youth-specific.

update resources set body_md = $g$Most fundraising fails before the ask or after it, rarely during. This guide is about getting TO a real ask, making it cleanly, and knowing it happened.

## What counts as an ask
All four, or it was not an ask:
1. You were together, one to one, in person or on video.
2. You made a specific request: a program, a project, or a number.
3. There was a conversation about it, not a monologue.
4. You expect a yes or a no.
A mailed letter is outreach. A hint is a hope. An ask is the four above.

## A great ask has two parts
The request, and the reason. "Would you consider $15,000?" is half an ask. "Would you consider $15,000? That funds three people through a full year of the program" is a whole one. The reason the number is the number lives in its own guide: Why this number.

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
When someone asks "how can I help?", have three answers ready: champion the work (speak for it), connect (bring one person in), give. Every yes is a yes; money is only one of the doors.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'Making the ask';

-- Why this number: the unit-math examples read youth-specific.

update resources set body_md = $g$Funders say yes to a clear request with an honest reason behind it. The funding rationale is that reason: invest X, and on average it does Y. This guide is how to build one.

## The shape
One sentence: "We need X because it will do Y." If you cannot fill in that sentence for a request, the request is not ready.

## Do the unit math
Break the work into a unit a funder can hold, then cost it honestly:
- What does one person's year in the program cost, all in?
- What does one workshop, one cohort, one campaign cost, and what does each one produce?
Then say it plainly: "$1,500 funds one person through the spring program." The giving-tree play is exactly this: a share of one person's journey, priced honestly.

## When the real impact is long term
You cannot measure a whole life from here. Use an honest proxy:
- Track the outcome you CAN see (program completion, first placements, skills demonstrated) and pair it with published research that links your proxy to the long arc.
- Say both parts out loud: "we measure this, and the research says it leads to that."
Funders respect a measured proxy plus honest reasoning far more than a grand claim with nothing under it.

## Operations are impact too
Salaries, rent, and systems are not a lesser category. Repackage them as what they do: "this role holds the weekly rhythm for forty people in the program" beats "unrestricted operating support" every time. If money keeps the work standing, say what the work is.

## Show your math
Put the arithmetic in the conversation, rounded and honest, and never hide the assumptions. "The numbers vary by person and by year, and here is the average" builds more trust than false precision. A funder who checks your math and finds it fair is a funder who stays.

## This week
Pick your most common request. Write its rationale sentence and the unit math beneath it. Read it to someone outside the organization; if they cannot repeat the reason back, tighten it.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'Why this number: the funding rationale';

-- AI in the daily workflow: the cause-words example was SafeSpace's own
-- category list. Body otherwise the additions version.

update resources set body_md = $g$AI is a strong assistant and a poor decision-maker. Use it to clean up your thinking. Never let it do the thinking.

## Where it earns its keep
- First drafts: outreach notes, newsletter sections, thank-you letters. You edit until it sounds like you, because donors give to you, not to a model.
- Summaries: paste your own meeting notes and ask for the three next steps.
- Prep: "What would a foundation program officer ask about this program?" is a good rehearsal.
- Unsticking: when a blank page stalls you, ask for three rough openings and rewrite the best one.

## Finding funders with it
The research models are genuinely good at prospect work. The method:
1. Widen your cause words. Ask it to list every way a funder might categorize your work. The same program can file under half a dozen headings, and you want to be findable under all of them.
2. Look sideways at peers. Name three or four organizations doing adjacent work and ask who funds them: foundations, families, corporations. Peer funders already believe in your cause.
3. Go deep on the shortlist. For each promising name, ask for their giving history, stated interests, and public contact paths, and tell it to exclude the famous mega-donors so the list is people who might actually take your call.
4. Verify everything before it enters your pipeline. Research models fabricate confidently; a name goes in your CRM only after you have checked it yourself.

## The rules
1. It drafts. You decide. Nothing goes out unread, and nothing goes out that you would not say in person.
2. It never sends on its own. No auto-replies, no scheduled sends you did not read that day.
3. Watch what you paste. Donor personal details, staff matters, and anything confidential stay out of tools we have not cleared. Names can usually be swapped out before pasting and back in after.
4. Facts get checked. Models are confident and sometimes wrong. Every number, name, and date in a draft gets verified by you.

## The habit
Use it daily for the small stuff and it buys you an hour; that hour goes to touches, calls, and the work only a person can do. The tool handles polish. You handle relationships.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'AI in the daily workflow';

-- Positive framing: one youth-specific line.

update resources set body_md = $g$How you say hard things shapes how safe people feel giving to you. Donors fund confidence, and confidence is honest framing, not spin.

## The stance
We are a learning organization. Things end, plans change, grants complete. None of that is failure language, because none of it is failure. It is the normal life of a real organization.

## The moves
- "The grant completed" and "the program wrapped its third year," never "we lost the funding" or "goodbye."
- Losses are lessons, said that way: "we learned this cohort needs a different schedule, and here is what changes."
- Lead with what holds: the people served, the rhythm kept, the team in place. Then the change, then the plan.
- Never signal instability to donors. Uncertainty inside the building is work for inside the building. By the time it reaches a donor, it is a plan.

## Writing the hard update
1. One sentence of what is true and good.
2. One sentence of what changed, plainly, no euphemism that hides the fact.
3. Two sentences of what happens next and who owns it.
4. Thank them for being the kind of partner you can tell the truth to.

## The line to hold
Positive framing is not hiding. If a donor would feel misled reading next year what you wrote this year, rewrite it. Frame honestly, and the framing itself becomes proof you are steady hands.$g$, updated_at = now()
where practice_id = (select id from practices where slug = 'sobo')
  and title = 'Positive framing';
