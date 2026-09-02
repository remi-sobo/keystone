# Client Hub · information architecture revision

Read this after `KEYSTONE-CLIENT-HUB-BUILD-PROMPT.md`. That document stays in force for everything structural: hosting on Keystone, client isolation, per-org theming, the six schema corrections, source file handling, and the guardrails. None of it changes.

This document replaces the surface. The handoff's thirteen tabs and the two added later become five.

---

## Why

Kendra said in her own interview that fundraising is not her skill set. Fifteen destinations is a filing cabinet, and a person who is unsure of the work does not open a filing cabinet, she avoids it.

The spec already had the right target:

> Kendra should open this and know what we need to raise, where it is coming from, and what she needs to do this week.

Five sections, each one a question she already asks.

**HOME** · What matters right now
**PEOPLE** · Who are we moving
**PLAN** · Where the money comes from
**MONEY** · Are we funded
**WORK** · Can we actually do this

Nothing else in the primary navigation. A quiet overflow holds files, export, and settings.

---

## What merges into what

| New | Absorbs |
|---|---|
| HOME | Start here, the stat tiles, the top of To do |
| PEOPLE | Donors, Prospects, Donor research, Stewardship |
| PLAN | Gift table, Monthly, Brunch, Grants, Churches |
| MONEY | Budget, cash timing |
| WORK | To do, Calendar, Hours, Collateral |

**Nothing built gets deleted.** The ten-section donor profile, the stewardship rules, the gift table, the cash calendar, the strategy playbooks all survive. They move one level down, behind the thing a person actually came to do.

---

## HOME

The Monday morning screen. Not a dashboard.

**Three numbers, not six.** Goal, committed, still to raise. Six stat tiles is dashboard thinking and it asks her to learn financial vocabulary before she can use the page.

**The progress figure is computed or it is absent.** This is the most important rule on this screen.

Committed is a sum of actual pledge and gift records with their trust levels, for the current fiscal year. It is not lifetime giving, not capacity, and not an estimate. If there are no pledge records yet, the screen says there are no commitments recorded yet and shows no bar. A progress bar filled with a plausible number is the one thing on this build most likely to be believed and wrong.

Every figure on Home carries its trust level the way every other figure does.

**Your next three moves.** Three, never more.

Each one is a verb, a subject, a reason, and an owner:

> **01 · CALL** Gary and Michelle Dillabough. Schedule the fall conversation.
> Major gifts · Kendra · this week

**These are chosen by rules, not by a model.** The ordering logic is explicit and readable in the code: overdue stewardship first, then blockers that are holding up other work, then the strategy furthest behind its goal, then the oldest untouched relationship above a capacity threshold. The reason is always visible on the card, because a suggestion without a reason is a demand.

AI may phrase the card. AI does not choose it. And Kendra can pin her own move into any of the three slots, which then holds until she unpins it.

**Where the money will come from.** One table, five rows, one per strategy. Goal, committed, gap, and a plain status word. This is the same data PLAN holds in full, summarized.

**This week.** Two numbers from WORK. Hours available and hours planned, with a plain sentence about whether that works.

---

## PEOPLE

One list. Search, then filters: All, Current donors, Prospects, Monthly, Needs follow-up, Do not contact.

A row shows the household, their relationship to the ministry, their last gift, and the next move. Nothing else.

Opening a household gives six sections: Snapshot, Giving, Relationship, Research, Notes, Next move. The ten-section research profile lives inside Research, collapsed. She thinks "I'm meeting Gary Thursday, what do I need to know," not "I should go into donor research."

**Stewardship survives as a queue, not as a person view.** The rules engine stays exactly as specced. Its output is the Needs follow-up filter, and anything overdue is eligible to become a move on Home. Fold the rules into a per-person page and the queue disappears, which means the finding that a $50,000 gift has no thank-you on record stops surfacing.

**Do not contact and no appeals remain enforced rules**, not warning text, exactly as the Keystone prompt states.

---

## PLAN

The fundraising plan itself. This is the document, not a page about the document.

Five strategy cards: major gifts, monthly partners, the fall brunch, church partners, grants. Each card shows goal, committed, pipeline count, the owner, and the next move.

Opening a card gives that strategy's full playbook, and each one carries four things the method requires:

- **The precondition.** What has to exist before this can start.
- **The dependency.** Who else has to do something.
- **The failure mode.** The specific way this goes wrong.
- **Done means.** What has to be true to call it complete.

**The gift table lives here**, not as a peer of the strategies. It is the arithmetic underneath major gifts and monthly, and it belongs inside them or on the tab beneath the cards.

**At the bottom of PLAN, two sections the five-tab structure would otherwise lose:**

**Risks.** Concentration, capacity, timing, key person. Short, named, with what happens.

**Open questions.** What is not settled, who owns it, and what the plan assumes meanwhile. This one is load-bearing. The entire build refuses to invent numbers, and this is where the things it refused to invent become visible instead of silent.

---

## MONEY

What the ministry costs and when the money is needed.

Four figures at the top: annual cost, fundraising goal, raised and committed, gap.

Then one chart, the cash calendar by month, showing when money is needed against when it is expected. It answers a different question than the goal does and it is the reason the November brunch matters.

Everything else goes behind **View budget details**: the functional split, the three-year arc, the gross-up tables, full cost versus direct cost, and the unsettled figures. Those are committee and planning material. They are not a Monday morning.

---

## WORK

Can we actually do this.

**This week, at the top.** Hours available against hours planned, by person, with a plain sentence when it does not fit.

**Budget hours at the strategy level, not the task level.** Major gifts three hours a week, brunch two, monthly one, and so on. Tasks may optionally carry an estimate but must not require one. Requiring a duration on every task means she stops entering tasks, and then the whole surface is wrong rather than just imprecise.

Kendra's number is about seven hours a week, mornings, with donor meetings Tuesday and Thursday. Her mother is arriving to take back-office and grant research, so the hours view is per person from the start.

**Tasks beneath**, grouped by owner, with the calendar as a view of the same data rather than a separate place.

**Blockers at the bottom.** Collateral that does not exist yet and what it is holding up. Not a list of documents, a list of things stopping other things:

> **Case for support** · Remi · due Sep 8
> Blocks church asks and major donor follow-up
>
> **House photography** · owner unassigned
> Blocks the case for support and the brunch invitation

---

## Demoted or cut from v1

**Ask anything AI.** Not a surface. AI helps inside a workflow: draft the thank-you, summarize a relationship, phrase a move. It does not get a text box on the navigation.

**The AI suggestion stream with accept and dismiss.** Gone. Its job is done by the three moves on Home, chosen by rules.

**Stat explainer modals.** A plain label and a small question mark that reveals one sentence. Not a modal per statistic.

**Quick add on every tab.** One persistent add control that creates a task, a person, a gift, a note, or a document.

**Parsing machinery.** She sees "Upload the latest Young Life report." She never sees the word parser, and she never chooses a file type.

**Print stays**, and it gets easier with five tabs. PLAN and MONEY print as a document for the committee.

---

## What does not change

Everything in the Keystone prompt. Client isolation and the tests that gate it. Per-org theming with no hex value in a component. The six schema corrections including gift source and enforced contact flags. No Keystone chrome. Source files out of the repo. Content in the database rather than in typed modules. No fabricated numbers, ever, and every figure carrying its trust level.

That is backstage complexity and it is the right kind. Kendra should never experience any of it.

---

## Build order, revised

The phases in the handoff still apply, but the surface work reorganizes.

**Phase one** is unchanged: migration with all corrections, client isolation tests, theming, and the shell. The shell now has five sections rather than fifteen.

**Phase two** is PEOPLE and the parsers. This is the largest single surface and the one with real data behind it.

**Phase three** is PLAN and MONEY, both reading from the budget and the strategies.

**Phase four** is WORK, including hours and blockers.

**Phase five** is HOME. It comes last on purpose, because it summarizes four things that have to exist before they can be summarized. Building it first produces a screen full of placeholders that then gets rebuilt.

**Phase six** is stewardship rules, AI drafting inside workflows, and print.

**Stop after phase two and show Remi**, as before.
