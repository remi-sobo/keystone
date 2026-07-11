# Spec: Keystone V2 5A, the closeout room

**Parent:** `specs/keystone-v2.md` Phase 5 epic 5A: the signature feature. The engagement ends with a formal "it stands without us" moment: final outcomes, final deliverables, open risks, ownership map, maintenance rhythm, training completed, what-to-do-if-it-breaks, the final digest, and the renewal option. It closes against the Charter: every success measure resolved, every "not included" restated, every owner named.
**Grounded against:** the live codebase after Phase 4. Everything the room shows already lives in the record (charter 2A, outcomes 2C, deliverables 3D with acceptance, digests 3G, decisions 2B); 4E's "ready for closeout" phrase is the signal that opens it. What 5A adds is the six consultant-authored sections and the formal published moment with a sign-off.
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing move-to-Phase-5 instruction (gates taken as recommended).
**Date:** 2026-07-11

---

## 1. What 5A is

- **Migration 0031:** `closeouts`, one per engagement: the six authored sections (open risks, ownership map, maintenance rhythm, training completed, what to do if it breaks, what comes next), status draft|published, published_at. Everything else in the room is READ from the record at render, never copied: copied outcomes would drift, and the room's honesty is that it shows the real ledger. RLS is the charter pattern: the practice reads and writes its own; a client session reads PUBLISHED rows only. No delete policy: a published closeout is the record of an ending.
- **Practice room** (`/engagements/[id]/closeout`): the record on one side (charter with its not-included lines, outcomes with reached and standing, deliverables with acceptance state, workstreams against the final stage), the six section editors on the other. Save keeps a draft the client never sees; Publish is the deliberate moment (and notifies the client team). After publish: request the sign-off, riding the 5D approvals primitive unchanged (subject_type 'closeout' has been legal since 0012).
- **Client room** (`/closeout`, in the desktop nav): the published room. Final outcomes as facts, deliverables linking home, the six sections, the latest sent digest, the charter link, and the sign-off block (the charter's approve/not-yet flow, note required on not-yet). The what-to-do-if-it-breaks section renders first among the six: it is the thesis in writing.
- **Sign-off:** approvals, decided once, audited: who agreed the arch stands, and when.

## 2. CONFIRM gates for 5A (taken as recommended under the standing instruction)

| # | Question | Recommendation |
|---|---|---|
| 5A-1 | The room READS the record; only the six sections are stored? | Yes. Copied outcomes drift; the room's honesty is the live ledger |
| 5A-2 | Draft invisible to the client; publish is the deliberate moment? | Yes. The engagement_drafts discipline applied to the ending |
| 5A-3 | Sign-off rides the 5D approvals primitive unchanged? | Yes. One approval spine for charter, deliverables, closeout, case study |
| 5A-4 | No delete: a published closeout stands? | Yes. You do not un-ring the bell; a wrong section is edited, and the record shows updated_at |
