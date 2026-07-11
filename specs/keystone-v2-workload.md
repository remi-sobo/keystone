# Spec: Keystone V2 4C, staff workload and ownership

**Parent:** `specs/keystone-v2.md` Phase 4 epic 4C: consultant assignment per engagement and per workstream, a workload view, upcoming sessions by consultant, and the waiting-on distinction across the practice. Descriptive, never a productivity score on our own team: the humane rule turned inward.
**Grounded against:** the live codebase after 4B. Practice members are first-class since 1A; homework already assigns to practice members; what is missing is ownership of the WORK CONTAINERS (engagements, workstreams) and one page that answers "who is carrying what, and what is waiting on whom."
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing finish-Phase-4 instruction (gates taken as recommended).
**Date:** 2026-07-11

---

## 1. What 4C is

- **Ownership columns** (migration 0026): `owner_practice_member_id` on engagements and on workstreams, nullable, on delete set null. An engagement owner is the relationship holder; a workstream owner is the workhorse. Columns only: they ride the standing walls (updates through keystone_can; a client session cannot resolve the reference because practice_members reads practice-side only, and no client surface selects the column).
- **Assignment where the work lives:** an owner picker beside the engagement header line and one per workstream row, both writing through the session client under RLS.
- **/team** (new practice page, in the nav): one section per active practice member: the engagements they own (client and title), the workstreams they own (title and stage), their next seven days of sessions (sessions inherit the engagement owner; no session-level owner column until reality demands one), and the waiting-on distinction inside their engagements (unanswered client messages, submissions standing), as counts in prose. A "No owner yet" section lists unowned engagements and workstreams, because unowned work is the first workload fact.

## 2. What it is NOT

No capacity model, no utilization, no per-member percentages, no ranking. The page answers "who do I ask" and "where is work waiting," not "who is slow." The gate greps the vocabulary.

## 3. The per-feature gate walk

- Columns on already-walled tables; no new policies, so the matrix cases stand as they are. The write path is the session client riding keystone_can.
- Ownership renders on practice surfaces only; the client experience is byte-identical.
- Actions verify the assignee is a member of the caller's own practice before writing.
- Copy voice-swept; descriptive, never scored.

## 4. CONFIRM gates for 4C (taken as recommended under the standing instruction)

| # | Question | Recommendation |
|---|---|---|
| 4C-1 | Ownership as nullable columns on engagements and workstreams; sessions inherit the engagement owner? | Yes. Two levels are real today; a third waits for a real need |
| 4C-2 | /team stays descriptive: lists and prose counts, never utilization or a score? | Yes, firmly. The humane rule turned inward |
| 4C-3 | Unowned work renders first-class ("No owner yet")? | Yes. The gap is the signal |
