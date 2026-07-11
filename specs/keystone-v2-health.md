# Spec: Keystone V2 4E, engagement health in voice

**Parent:** `specs/keystone-v2.md` Phase 4 epic 4E: a practice-only read of momentum (responsiveness both ways, homework completion, stage movement, cadence held, messages unanswered, digest consistency), rendered in voice: "holding steady," "waiting on the client," "ready for closeout." Never a score, never a color, never a client-visible surface.
**Grounded against:** the live codebase after 4D. Every signal already exists in the record: 4A reads them for TODAY (what needs me now); 4E reads the same sensors ACROSS TIME (how is this engagement moving). 4D's `readinessFacts` set the pattern this epic completes: a pure fixture-gated lib turning rows into prose, with the walls belonging to the pages that call it (both practice-only here).
**Status:** draft for Remi. CONFIRM gates in section 7.
**Date:** 2026-07-11

---

## 1. What 4E is

One phrase per engagement, chosen by deterministic rules from the record, with two or three supporting fact lines under it. On /engagements, each engagement card leads with its phrase ("SafeSpace: holding steady"); on the engagement page, the phrase sits quietly under the title. The phrase set, in decision order (first match wins):

1. **"ready for closeout"**: every workstream stands at its final stage. The quiet queue IS the signal 5A waits for.
2. **"waiting on us"**: an unanswered client message or an unreviewed submission is standing (the 4A group-1 conditions, aged past a day).
3. **"waiting on the client"**: open review homework past due with no submission, or a date poll open past three days with marks missing. Names the CLIENT, never a person: "waiting on SafeSpace," never "waiting on Jasmine" (the humane-data law applied to blame).
4. **"moving"**: a stage event landed inside the last three weeks.
5. **"holding steady"**: no stage move, but the rhythm holds: a session held or homework completed inside the window.
6. **"quiet for N weeks"**: none of the above; N counted from the last event of any kind, in words.

Supporting lines are facts in prose (the 4D discipline): "last session eight days ago; 3 of 4 homework items on time this month; the digest went out both of the last two weeks." Responsiveness renders both ways or not at all: if the practice's reply lag shows, so does the client's, because a mirror pointed only at them is surveillance.

## 2. Schema

**None.** No migration, no stored health, no history table. Health is DERIVED at render from the record (gate 4E-1): storing it would create a second source of truth that drifts the moment a message arrives, and a stored trail of health labels is a performance file by another name. 4A's precedent holds: the sensors live in the record; the lib only reads.

## 3. The composition (src/lib/health.ts, pure and fixture-gated)

`engagementHealth(inputs)` takes the window's rows (workstream stages, stage events, sessions, items with due and done, the loop trail kinds, unanswered thread ages, open poll age and mark counts, sent digest weeks against the cadence) and returns `{ phrase, lines }`. The decision ladder above is code; the gate walks every rung with fixtures, proves first-match-wins, and greps the output vocabulary: no score, no percent, no grade, no red, no "behind."

**Surfaces (both practice-only by construction):**
- **/engagements:** each engagement card gains its phrase as the lead line and one supporting fact line, replacing nothing (the workstream arcs stay).
- **The engagement page:** the phrase renders in the eyebrow area, quietly, with the fact lines in a title attribute-free plain paragraph under the header. No card, no widget, no gauge.
- **Nowhere else (gate 4E-4):** not on any client surface, not in digests, not in notifications, not in the Q&A corpus. Health is the consultant reading the room, and a reading spoken to the room changes the room.

## 4. What this hands the later epics

5A opens the closeout room when the phrase says ready. 4C (workload) sums phrases across many clients when there are many. 5C quotes the trajectory honestly because the record, not a stored label, is the source.

## 5. AI

None. The phrases are deterministic rules, not generation; "rendered in voice" means the vocabulary is ours, not that a model writes it. (If a model ever narrates momentum, it rides the proposals path in its own spec.)

## 6. The per-feature gate walk

- No schema, no policies; every query practice-session under standing RLS, on tables whose walls the matrix already proves (including homework_activity and the polls, which the practice reads in full).
- No new person-data; no per-person rendering anywhere in the output (the lib's gate asserts the vocabulary and that lines name clients and artifacts, not members).
- Copy voice-swept; descriptive, never scored; both-ways-or-not-at-all on responsiveness.
- Practice surfaces only; the client experience is byte-identical before and after this epic.
- Mobile: the phrase line on /engagements at 390px; nothing new to lay out.

## 7. CONFIRM gates for 4E

| # | Question | Recommendation |
|---|---|---|
| 4E-1 | Health is derived at render, never stored: no migration, no history table? | Yes. Stored health drifts the moment a message arrives, and a label trail is a performance file by another name. The record is the history |
| 4E-2 | The phrase ladder as listed, first match wins, deterministic in a fixture-gated lib? | Yes. Six phrases cover the real states; determinism means you can always answer "why does it say that" by pointing at rows |
| 4E-3 | "Waiting on the client" names the client, never a member? | Yes, firmly. The humane-data law applied to blame; the homework loop already tells you WHO privately where you coach |
| 4E-4 | Renders on /engagements and the engagement page only; never client-visible, never in digests or notifications? | Yes. A reading spoken to the room changes the room |
| 4E-5 | Responsiveness both ways or not at all? | Yes. If their reply lag shows, ours shows beside it; a mirror pointed only at the client is surveillance |
