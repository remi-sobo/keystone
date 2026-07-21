-- Library addition (2026-07-21): The second bottom line, the guide
-- Remi brought in on the two-bottom-line frame: a nonprofit is a
-- business with two bottom lines (impact and revenue), the sector
-- survival data, Collins's resource engine, the Matrix Map portfolio
-- discipline, and the Bridgespan funding models. Generic per the
-- shelf rule (docs/library-generic-sweep.md): no client-named
-- material. Client-visible on the 0029 audience wall.
-- Idempotent: the insert guards on title.

with p as (select id from practices where slug = 'sobo')
insert into resources (practice_id, title, kind, audience, body_md, tags)
select p.id, 'The second bottom line', 'guide', 'client',
$g$Here is the sentence that changes how you run a nonprofit, and it is blunt on purpose: a nonprofit is a business. The word nonprofit describes exactly two things. You do not own it, and you cannot profit from it personally. That is all it means. It does not mean you are excused from money. You still have to bring money in, every year, forever, and the mission you love depends on how well you do it.

Most people arrive at nonprofit leadership through program, and thank God for that. You came because you care about young people, or families, or your community, and the caring is real and it should stay first. But program people are often handed an organization without ever being told the second half of the job. Then the second half blindsides them. Not because they lacked heart. Because nobody named the whole assignment.

The whole assignment is this: a for-profit business has one bottom line. You have two, impact and revenue, and you are accountable to both at once. That makes your job harder than a business owner's, not softer. A business can chase money at the expense of nearly everything else and still call it winning. You do not get that shortcut. Every significant decision you make has to answer two questions: does this deepen our impact, and does this strengthen our ability to fund the work? The leaders who last are the ones who stop treating those as competing questions and start making decisions where each answer feeds the other.

## What happens when only one bottom line gets managed

The numbers here are sobering, and they should be.

Roughly three in ten nonprofits do not reach their tenth year, per the National Center on Charitable Statistics, and when researchers and practitioners list why, the most common reason is the same one, over and over: they ran out of money. Not out of heart. Not out of need in the community. Out of money.

The organizations still standing are not exactly comfortable either. In the Nonprofit Finance Fund's 2025 State of the Nonprofit Sector survey of more than two thousand organizations, over half reported three months or less of cash on hand, and nearly one in five held a month or less. More than a third ended the prior year with an operating deficit, the highest share in the survey's ten-year history. And 81 percent said they struggled to raise enough to cover their costs.

Read that last one again. Eight out of ten organizations full of good people doing needed work could not comfortably cover the cost of doing it. The heart was never the problem. The money side of the house was undermanaged, underplanned, and often underrespected, and the mission pays that bill eventually.

One more finding worth carrying with you: research on ten years of nonprofit tax filings found that organizations with more diversified revenue were meaningfully less likely to dissolve than those leaning on a single source. Money strategy is survival strategy. That is not cynicism. That is the data.

## Money is the engine, mission is the output

Jim Collins, in his monograph on the social sectors, gave this the cleanest frame anyone has written. In business, money is both an input and an output: you spend it to make more of it, and the making is the point. In the social sector, money is only an input. The output is the mission. Nobody founds a youth organization to maximize revenue, and nobody should.

But here is the part leaders skip: if money is the input, then every serious organization needs what Collins calls a resource engine, a deliberate answer to the question of where the fuel comes from, this year and every year after. An engine is designed. It has parts, it has maintenance, it has someone responsible for it. Hope is not an engine. A single generous funder is not an engine. A gala that exhausted your whole team is not an engine.

This is the mental shift from program leader to nonprofit executive. The program leader asks, what are we doing for the people we serve? The executive asks that too, and then asks, and what funds it, and what funds it in three years, and who owns the work of making sure? Neither question is nobler than the other. They are the two halves of one job. If the second question makes you feel like you are betraying the first, sit with this: every dollar you fail to raise is a service you will not deliver. Getting good at money is not a departure from the mission. It is how the mission eats.

And if the second question simply is not a job you want, that is a legitimate answer too. It just means the executive seat is not your seat, the way a great teacher does not owe anyone a principalship. The trouble only starts when someone takes the seat and does half the job.

## The discipline: make decisions with both eyes open

Knowing you have two bottom lines is the mindset. Here is the practice.

Jeanne Bell, Jan Masaoka, and Steve Zimmerman, in their book Nonprofit Sustainability, built a tool for exactly this called the Matrix Map, and the idea is simple enough to run on a whiteboard. Take everything your organization does, every program, every event, every revenue activity, and plot each one on two axes: how much impact it produces, and what it does to your money, net.

Four kinds of things show up.

Some work is high impact and also feeds the budget. Protect it and grow it. Some work is high impact and loses money, and most core programs live here. That is fine and normal, but it is not free: something else has to carry it, on purpose, and you have to know what. Some activity is modest on impact but reliably feeds the budget. Do not sneer at it. Managed honestly, it is what pays for the work you would do for free. And some things are low on impact and lose money, and those you finish with dignity and stop, because they are eating the mission's food.

The discipline is holding the whole portfolio in view, so the sides carry each other by design instead of by accident. This is what "make one serve the other" looks like in practice. The strongest organizations are not the ones where every program pays its way. They are the ones where the leader knows exactly which parts of the engine fund which parts of the mission, and says so out loud, to the team and to the board.

Two habits make the discipline real. First, when a new idea shows up, ask both questions before yes: what does this do for impact, and what does it do to the money, and who confirmed the second answer? Passion answers the first question loudly and volunteers nothing about the second. Second, review the map on a rhythm, at least once a year with the board, because programs drift between quadrants and last year's star can be this year's slow leak.

## Name your model, then work your model

The second half of money discipline is honesty about where your money actually comes from.

Researchers at Bridgespan studied how large nonprofits actually got funded and published the result as ten distinct funding models. The detail matters less than the headline: organizations that grow strong do not fund themselves by chasing everything. They figure out which kind of money matches their work, individual givers moved by the cause, foundations, government contracts, earned revenue, a deliberate mix, and then they build strategy, staffing, and rhythms for that model specifically.

So name yours. If your engine is individual and major giving, then your calendar should be full of stewardship and cultivation, your team trained on the ask, and your story sharp enough to move a stranger. If foundations matter, someone owns a grants pipeline and understands that institutional funders think differently than people do. If families and community are part of it, build the participation model where the people closest to the work help sustain it, the way a congregation sustains a church. And whatever the mix, remember the diversification finding: engines with more than one cylinder survive the winters.

What your model cannot be is unspoken. An unnamed funding model is how organizations end up doing a little of everything, well-fed by none of it, and calling the exhaustion normal.

## Both, every week

Here is the summary you can put on the wall.

The mission is why you exist. The money is how you keep existing. You are the leader of both, and the day you accept that without resentment is the day the job gets simpler, because you stop experiencing the money work as an interruption of the real work. It is the real work. It is the half of the real work that makes the other half possible next year.

You will not choose between the heart and the bottom line, because you do not have that option. You have two bottom lines. The organizations that thrive are led by people who learned to love what the second one makes possible, built the engine on purpose, and made their decisions with both eyes open.

It is usually not the heart. It has never been the heart. Build the engine, run the portfolio honestly, and the heart gets to do its work for decades.

---

*Sources described in this guide: National Center on Charitable Statistics (nonprofit closure rates); Nonprofit Finance Fund, 2025 State of the Nonprofit Sector Survey; research on revenue diversification and nonprofit dissolution from ten years of Form 990 data; Jim Collins, Good to Great and the Social Sectors; Jeanne Bell, Jan Masaoka, and Steve Zimmerman, Nonprofit Sustainability (the Matrix Map); Landes Foster, Kim, and Christiansen, Ten Nonprofit Funding Models, Stanford Social Innovation Review.*$g$,
array['leadership','fundraising','strategy','money']
from p
where not exists (
  select 1 from resources r, p where r.practice_id = p.id and r.title = 'The second bottom line'
);
