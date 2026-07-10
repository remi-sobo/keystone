# Spec: Keystone V2 2F, workstream detail and "why we're here"

**Parent:** `specs/keystone-v2.md` Phase 2 epic 2F: the difference between a dashboard and understanding.
**Grounded against:** the live codebase after 2B (migrations 0001 to 0013). `WorkstreamArc.tsx` shows the stage; `workstreams` has no explanatory field; decisions, action_items, and deliverables all already carry `workstream_id`, so the panel below is mostly composition.
**Status:** draft for Remi. CONFIRM gates in section 6.
**Date:** 2026-07-10

---

## 1. What 2F is

The arc says WHERE each workstream stands; 2F says WHY. Two pieces:

1. **The "why we're here" note:** one small consultant-authored text field per workstream ("we are in Build because the intake workflow is drafted and being tested"), the outsized-effect field the V2 spec names. Client-facing, plain prose, voice-swept. AI drafting of this note is 2F's later half (propose-then-accept, after 3A); v1 is manual and the field is the point.
2. **The expandable panel:** under each arc on the client Home, a quiet fold holding what that workstream means right now: the stage meaning in one sentence, the consultant's note with its date, the recent decisions tagged to it, open homework count, and its latest deliverable. All reads of tables that already exist; no new walls.

## 2. Schema delta (migration 0014, two columns)

```sql
alter table workstreams
  add column note_md text,
  add column note_updated_at timestamptz;
```

No new table, no RLS change: workstreams already carries both walls and its policies serve. The note is client-visible the moment it saves (CONFIRM 2F-1); it is written FOR the client, and a note the consultant is not ready to show is a readiness note, not a workstream note.

**Isolation matrix:** no new rows needed for scope (covered since Ring 1); one assertion added, that a client member cannot write the note (the existing write policy already says so; the matrix says it out loud).

## 3. Surfaces

**Practice, on the engagement page:** each workstream row gains an inline note form (current note, save; voice-swept like the charter). One field, no ceremony; keeping it current is a ten-second act after a session.

**Client, on Home:** each `WorkstreamArc` gets a `<details>` fold beneath it:

- The stage meaning, one shared voice-checked sentence per stage (Diagnose "we are mapping what exists and what it needs", Design, Build, Train, Stabilize; a copy map in one file, CONFIRM 2F-3).
- The consultant's note and when it was last touched ("from your consultant, Jul 10").
- Up to three recent decisions tagged to this workstream, linking to /decisions.
- Open homework on this workstream (count plus the nearest due), linking to /homework.
- The latest deliverable tagged to it, linking to /deliverables.

Server-rendered, no client JS beyond the native `<details>`; a fold per arc keeps Home calm and the tap target generous at 390px.

**Not in 2F:** the next session tied to the workstream. V1 sessions carry no `workstream_id`; that linkage arrives with 3B's run of show, where a session declares which workstream and stage it intends to move. Deferred rather than half-built (CONFIRM 2F-2).

## 4. AI

None in v1. The AI-drafted note (from recent stage events and decisions, propose-then-accept, approved before it shows) rides on 3A's review hub when that lands; the note column is its landing site, already inert-by-human-approval since only the practice can write it.

## 5. The per-feature gate walk

- No new scoped table; two columns on an already-matrixed one, write walls unchanged and asserted.
- No new routes: both surfaces extend existing pages. The client fold is pure RLS reads of tables that already carry both walls.
- Copy: stage meanings and every note pass the voice gate; growth described, never scored.
- Mobile: the fold is designed at 390px first; the panel is the phone reading experience.

## 6. CONFIRM gates for 2F

| # | Question | Recommendation |
|---|---|---|
| 2F-1 | Is the note client-visible immediately on save? | Yes. It is written for the client; drafts-for-later belong in readiness notes, which stay practice-only |
| 2F-2 | Session-to-workstream linkage now or with 3B? | With 3B. Sessions have no workstream_id today; the run of show is where a session declares what it moves. Half-adding the column now buys nothing the panel needs |
| 2F-3 | Stage meanings: one shared copy map, or per-practice configurable? | Shared copy map in v1 (practices already rename stages via stage_config; the meanings follow the five canonical stages). Configurable copy is product-tier polish for later |
