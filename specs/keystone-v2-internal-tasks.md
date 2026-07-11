# Spec: Keystone V2 4B, internal tasks vs client homework

**Parent:** `specs/keystone-v2.md` Phase 4 epic 4B: a clear split. Client homework is client-owned and client-visible. Practice tasks are consultant-owned and invisible to clients. Shared commitments are visible to both.
**Grounded against:** the live codebase after 4E. The kernel shipped with 3C: `action_items.audience` ('client'|'practice') with the wall IN the read policy (a client session cannot read a practice-audience row, by construction, matrix-proven), and 3A's review workspace already births internal tasks (`disposition: internal` lands `audience: 'practice'`). What 4B adds is legibility: the surfaces that make the three kinds of work read as three kinds of work.
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing finish-Phase-4 instruction (gates taken as recommended). No migration.
**Date:** 2026-07-11

---

## 1. What 4B is

The schema already knows three kinds of work; the rooms do not say so yet. The split, made legible:

1. **Client homework** (`audience: 'client'`, assigned to a client member): the coaching loop, unchanged.
2. **Internal tasks** (`audience: 'practice'`): consultant-owned, invisible to every client session by policy. They currently sit inside the practice's open-homework list wearing a small "internal" chip. 4B gives them their own list with a one-click Done (and Reopen on the recently-done), because an internal task is a check-off, not a coaching loop: no trail rows, no notifications, nobody to hold accountable but ourselves.
3. **Shared commitments** (`audience: 'client'`, assigned to a PRACTICE member): what we owe the client, on the record. Today the client page renders these as "unassigned" team items, which is dishonest in the humble direction. They become their own strip on the client homework page ("With your consultant team") and carry an "our commitment" mark on the practice side.

## 2. Schema

**None.** The audience column, its check, and the wall shipped in 0017. The model already expresses all three kinds: audience says who SEES, the assignee says who DOES. 4B is surfaces only.

## 3. The build

- **Practice engagement page:** the open list splits. "Open" holds client-audience items (shared commitments marked "our commitment"); "Internal tasks" holds practice-audience items with the practice assignee, due date, and a Done button. Recently-done internal items offer Reopen. The add form is unchanged (it already speaks audience).
- **Actions:** `completeInternalTask` and `reopenInternalTask` verify practice membership, load the item under RLS, refuse anything whose audience is not 'practice', flip status, and audit as metadata. No homework_activity rows (the trail is the coaching loop's), no notify (we do not ping ourselves about ourselves; /today already lists overdue internal tasks).
- **Client homework page:** open items split three ways: yours, the team's (client-assigned or unassigned), and "With your consultant team" (practice-assigned, client-audience): title and due, read-only, no Done button (ours to do, not theirs to check off).

## 4. The per-feature gate walk

- No schema, no policy change; the 0017 wall stands and the matrix already proves it (including the member_a1c same-client case).
- Client surface stays pure RLS: the new strip reads the same table through the same policy; a practice-audience row cannot arrive.
- Internal completes stay silent: no notification, no email, no client-visible trace.
- Copy voice-swept; descriptive, never scored.

## 5. CONFIRM gates for 4B (taken as recommended under the standing instruction)

| # | Question | Recommendation |
|---|---|---|
| 4B-1 | No new audience value; shared commitments are audience 'client' plus a practice assignee? | Yes. The model already expresses it; a third enum value would add a policy branch with no new meaning |
| 4B-2 | Internal tasks are check-offs: no trail, no notifications? | Yes. The loop is for coaching; internal tasks need a Done button, not a ceremony |
| 4B-3 | The client sees our commitments as read-only? | Yes. They watch us keep our word; they do not manage our list |
