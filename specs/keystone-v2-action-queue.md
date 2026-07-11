# Spec: Keystone V2 4A, the action queue

**Parent:** `specs/keystone-v2.md` Phase 4 epic 4A, the phase opener: one prioritized queue answering "what needs me today," grouped by urgency, descriptive and never red-badged (the /today law since Ring 3.5: the queue is aspirational, what landed is factual, the gap is the signal).
**Grounded against:** the live codebase after Phase 3. /today already computes most of the raw signals in separate cards: unanswered client messages with age, submitted homework, the digest queue, the 4F inbox, the stall detector. Phase 3 quietly built the missing sensors: 3B's moves pair makes "workstream ready to move" mechanically readable, 3B's purpose/agenda make "session prep needed" a real query, and 3C's audience column makes internal follow-ups first-class. 4A is almost pure composition; the one thing it adds is order.
**Status:** BUILT 2026-07-11, same day as the spec. All five gates approved as recommended (Remi). No migration, as gated: pure composition in lib/actionQueue.ts.
**Date:** 2026-07-11

---

## 1. What 4A is

The Monday screen grows a spine. At the top of /today, ONE ordered list: every item a single line naming the client, the thing, and the age, linking straight to where the work happens. Grouped by urgency, in this order:

1. **A client is waiting on us**: unanswered client messages (their word is last in the thread), and homework submitted for review. Someone on the other side of the wall acted and is watching the door.
2. **Digest to approve**: proposed drafts in the queue; Friday's work should not meet Monday.
3. **Session prep needed**: booked sessions in the next seven days still missing a purpose or an agenda (the 3B fields), because walking in without a run of show is the thing this product exists to prevent.
4. **Workstream ready to move**: a HELD session named a move ("this session moves Program Rhythm toward Build") and the workstream's stage has not changed since. The intention is on record; the arc is waiting.
5. **Follow-up overdue**: internal practice tasks (3C's `audience = 'practice'`) past their due date, and the standing three-week stall flag.

Nothing here is a score, a percentage, or a red badge; each line is a fact with a link, and an empty queue says so plainly ("Nothing needs you today. The room is quiet.").

## 2. Schema

**None.** No migration, no new tables, no new columns, no new policies. Every signal reads existing tables through the practice session under standing RLS. This is the whole point of the epic landing after Phase 3: the sensors were built into the record as it happened; 4A only orders what they already say.

## 3. The composition (src/lib/actionQueue.ts, pure and gate-tested)

A pure function takes the fetched rows (unanswered threads, submitted items, digest proposals, upcoming sessions, held sessions with moves plus current workstream stages, overdue internal items, stalled workstreams) and returns the ordered groups with one composed line each ("SafeSpace has been waiting 2 days on a message", "Thursday's session has no run of show yet"). Age renders in days, in prose, never in color. The page fetches; the lib decides; the gate tests the lib with fixtures (ordering, the ready-to-move rule, the empty case).

**/today reshapes around it (gate 4A-5):** the queue leads the page; the 4F inbox card and the digest queue detail (the approve/dismiss forms) stay below it; the sessions-this-week, homework, and messages cards fold into the queue's lines instead of standing as separate cards; the stall section folds into group 5. One page, one question, one answer.

**Mobile:** the queue is the practice phone surface: one line per item, full-width taps, groups as quiet eyebrows.

## 4. What this hands the later epics

4E (health) reads the same signals over time instead of today. 4C (workload) sums the queue across clients when there are many. 5A (closeout) inherits a quiet queue as the signal an engagement is ready to close.

## 5. AI

None. The queue is facts in order. (4E may later render momentum in voice; that is its spec, not this one.)

## 6. The per-feature gate walk

- No schema, no policies, no new person-data; every query practice-session under standing RLS, engagement-scoped or practice-wide exactly as the source tables already allow.
- The composition lib is pure and unit-gated; the ordering is code, not vibes.
- Copy voice-swept; descriptive, never scored; no member of the client team is ever shown as "the one blocking" (group lines name clients and things, not people, except where the thing IS a person's submission you asked for).
- Practice surface only; the client's Home strip (2D) is untouched.
- Mobile: /today at 390px is the epic's felt surface.

## 7. CONFIRM gates for 4A

| # | Question | Recommendation |
|---|---|---|
| 4A-1 | Pure composition: no migration, no new state, signals read from the record as it stands? | Yes. Phase 3 built the sensors; adding queue-state now would be a second source of truth to drift |
| 4A-2 | The group order: client waiting, digest, session prep, ready to move, follow-up overdue? | Yes. People before paper, paper before intentions, intentions before housekeeping |
| 4A-3 | "Ready to move" = a held session that named a move with the stage unchanged since? | Yes. It is the first mechanical reading of 3B's moves pair, and it is descriptive: the line says what was intended, never "you are behind" |
| 4A-4 | "Deliverable promised" deferred until promises have structure? | Yes. The planned ledger is a pinned library document today (the V1 FLAG stands); a queue line needs a table to read, and 5E's change orders or a later pass gives it one honestly |
| 4A-5 | The queue replaces the scattered /today cards as the lead, with the inbox and digest detail below? | Yes. One page, one question. The cards were the queue before the queue existed |
