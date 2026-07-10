# Spec: Keystone V2 3A, the editable AI proposal review

**Parent:** `specs/keystone-v2.md` Phase 3 epic 3A, sequenced first in the phase because it is a hub, not a leaf: decisions (2B) and internal tasks (4B) are born here.
**Grounded against:** the live codebase after Phase 2. Today `extract.ts` proposes `{summary_md, decisions_md, action_items[]}` into ONE `ai_proposals` row and `decideProposal` is coarse: accept everything (publish the note, create every item as client homework) or dismiss everything. The decisions table already carries `source = 'accepted_proposal'` and `proposal_id` (pre-landed in 0013, waiting for this epic). `action_items_read` currently shows every engagement item to every client member, which is exactly why the internal-task convert target needs a wall in this same PR.
**Status:** draft for Remi. CONFIRM gates in section 7.
**Date:** 2026-07-10

---

## 1. What 3A is

The review workspace between "what the AI said" and "what you publish." On the session's notes page, a pending extraction becomes editable: rewrite the summary, edit the decision lines and choose which enter the decision log, and shape each action item (edit it, drop it, make it client homework, or make it an internal practice task) before anything touches the record. Two laws:

1. **The original is never lost.** The AI's payload is immutable from the moment it lands; every edit is a separate copy. "What the AI said" versus "what you published" is recoverable forever, which is the honesty that makes propose-then-accept mean something.
2. **Publishing stays the ONE human path into the record**, now with finer hands. Nothing here adds an autonomous write; it adds precision to the existing accept.

## 2. Schema (migration 0017, two small deltas)

```sql
alter table ai_proposals
  add column edited_payload jsonb,
  add column edited_at timestamptz,
  add column edited_by uuid references auth.users(id);

alter table action_items
  add column audience text not null default 'client'
    check (audience in ('client','practice'));
```

- `payload` becomes structurally immutable: a trigger rejects any UPDATE that changes it (the same never-rides-the-payload discipline the approvals trigger set). Edits live only in `edited_payload`; publish reads `edited_payload ?? payload`.
- **The internal-task wall (the 4B kernel, pulled in because leaking is worse than waiting):** `action_items_read` is rebuilt so a client member sees only `audience = 'client'` rows; the practice sees everything. The check-off policy already keys on own-membership, and internal tasks are practice-assigned, so no other policy moves. 4B's fuller surfaces (the split views, shared commitments) come later; the wall comes now.
- **Isolation matrix, same PR:** a client member reads zero practice-audience items in an engagement where client items exist beside them; the payload-immutability trigger asserted (an UPDATE touching payload fails even for the practice session); cross-scope walls unchanged and re-asserted for the new column.

## 3. The review workspace (on the session notes page, where the queue already lives)

A pending extraction renders as an editable form instead of the current read-only block:

- **Summary:** a textarea seeded from the proposal, voice-swept on save.
- **Decisions:** the proposal's decision lines, one row each: editable text, a "log as decision" toggle (default on), date (default the session date), and who (free prose, the 2B shape). Toggled-off lines stay in the published note only.
- **Action items:** one row each: editable title, assignee, due date, timing, and the disposition pick: **client homework** (today's behavior), **internal task** (practice-assigned, `audience = 'practice'`, invisible to every client member), or **drop**. An "add item" row covers what the model missed, because the review is where the human's memory of the call gets its say.
- **Save as draft** writes `edited_payload` (status stays `proposed`; the queue shows "edited, unpublished"). Review is resumable like the builder.
- **Publish** offers the selective checkboxes: the note (summary plus decisions, shared to the client), the decision-log entries, the items. Unchecked groups simply do not publish; the proposal is marked accepted either way, and the audit detail records what shipped and what was held.
- **Dismiss** stays as it is.

Publishing writes, in order: the session note (existing path), the toggled decision rows (`source = 'accepted_proposal'`, `proposal_id`, `session_id` set, the 0013 columns finally earning their keep), and the items with their audiences. Voice gate on every published string; audit one entry with counts, never content.

## 4. What this unlocks nothing else has to build

2B's log gains its intended inflow (no double entry between note and log). 4B arrives to find internal tasks already walled and born in the right place. 2E's Q&A corpus picks up logged decisions automatically since it already reads the table. The parking-lot disposition from the V2 spec's sketch is DEFERRED (CONFIRM 3A-2): there is no parking-lot surface to see such a note yet, and a disposition without a home is a data graveyard.

## 5. AI

No new AI. This epic is the human half of the existing extraction job; the model's side does not change.

## 6. The per-feature gate walk

- No new tables; two columns and one rebuilt policy on already-matrixed tables, both asserted in the same PR (the internal-task zero-read is an isolation-matrix case by name, per the V2 spec's own instruction).
- Payload immutability enforced by trigger, not convention.
- New person-data: none (assignees and prose already existed).
- Copy through the voice gate; the workspace is a practice surface (service-role-after-check on publish, session-client reads).
- Mobile: the review workspace at 390px is the consultant reviewing on a phone after a call; single column, one item per card.

## 7. CONFIRM gates for 3A

| # | Question | Recommendation |
|---|---|---|
| 3A-1 | Pull the internal-task wall (audience column plus the rebuilt client read policy) into this PR? | Yes. The convert target exists the moment the workspace ships, and an unwalled internal task is a leak, not a feature. 4B keeps its surfaces |
| 3A-2 | The parking-lot disposition now or later? | Later, with 4A/4B where a parking lot has a surface to live on. A note nobody can see again is worse than dropping the item honestly |
| 3A-3 | Decision toggles default on or off? | On. The extraction already errs toward real decisions, and unchecking is one tap; the log missing a decision costs more than reviewing one extra line |
| 3A-4 | May a published proposal be re-opened? | No. Accepted is accepted; a correction is an edit to the note, a new decision superseding the old, or a new homework item, all of which exist. Re-opening would fork the record |
