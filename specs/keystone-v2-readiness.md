# Spec: Keystone V2 4D, readiness evidence

**Parent:** `specs/keystone-v2.md` Phase 4 epic 4D: each pillar gains linked evidence, a last-updated stamp, descriptive confidence, and a deliberate share action. The standing laws hold hard here: readiness is the consultant's lens (client zero-read since Ring 3), growth renders as history, and nothing ever scores a person.
**Grounded against:** the live codebase after 4A. `readiness_markers` holds three prose notes (philosophy, system, execution) per engagement, practice-only by policy, edited on the engagement page panel "(yours only)". Phase 3 built the evidence this epic links: 3C's loop knows what was done on time, 3B's sessions know what was held, 2B's log knows what was decided. The outcome_evidence pattern (kind plus ref, links removable, artifacts untouched) is the shape to reuse; the messages thread is where a composed reflection belongs.
**Status:** BUILT 2026-07-11, same day as the spec. All five gates approved as recommended (Remi). Migration 0025 applied live.
**Date:** 2026-07-11

---

## 1. What 4D is

The readiness panel grows from three opinions into three judgments with receipts. Three moves:

1. **Evidence per pillar.** Each pillar links to real artifacts: a session, a homework item, a decision, a deliverable. "System: they now run the weekly pipeline review without me" points at the session where they did and the homework that proved it. Links are removable (a wrong link was a mistake, not history); artifacts are never touched.
2. **Execution gets its facts computed.** The one pillar you cannot do for them reads its evidence straight from the record: sessions held in the last thirty days, homework completed on time versus late, review-loop submissions. Rendered as history beside your judgment, never as a grade on Aris or Jasmine, and NEVER visible to the client (the whole panel stays behind the practice wall).
3. **Sharing is a composed message.** "Share as a reflection" opens a compose box seeded from your three pillar notes; you rewrite it for their eyes (voice-swept) and it sends into the ONE message thread, where they can answer. No new client surface, no dashboard they stumble into: a coaching reflection is correspondence, deliberately written and deliberately sent.

## 2. Schema (migration 0025)

```sql
create table public.readiness_evidence (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  pillar        text not null check (pillar in ('philosophy','system','execution')),
  kind          text not null check (kind in ('session','action_item','decision','deliverable')),
  ref_id        uuid not null,
  note          text,
  added_by      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
```

- **Practice-only read, like the lens it serves (gate 4D-1):** the read policy is `is_practice_member(practice_id)` alone, the engagement_drafts discipline. A client member reads zero rows even though the table carries their client_id; readiness evidence inherits the readiness wall, because a receipt for a judgment the client cannot see is itself part of the judgment.
- Insert and delete ride `engagement.write`; NO update policy (a wrong link is removed, never edited; the outcome_evidence precedent). Ref ids are validated at write time against the engagement's own artifacts.
- **No confidence field is added (gate 4D-5):** confidence stays prose inside `note_md`, where it already lives. A confidence enum is a score wearing a coat.
- **Isolation matrix, same PR:** cross-practice and cross-client zero; the SAME-client member reads zero rows (the lens wall, the headline case); client insert denied; no-update asserted. Static gate `readiness-evidence.spec.ts`; the table joins the ratchet.

## 3. Surfaces (all on the engagement page panel; the client surface is untouched)

- **Per pillar:** the note and its updated-at stamp as today, plus the evidence list (kind icon, the artifact's title resolved practice-side, the optional note, a remove link) and an add form (kind select, then the artifact from a scoped picker like the outcomes evidence form).
- **Execution facts** (a pure `lib/readinessFacts.ts`, fixture-gated like the action queue): "4 sessions held in the last 30 days; 6 of 8 homework items done on time; 3 review submissions." Facts sit above your execution note as history; the lib provably never emits a percentage or a grade word.
- **Share as a reflection:** a fold under the panel with a MarkdownEditor seeded from the three notes ("Philosophy: ... / System: ... / Execution: ..."), a plain warning line ("This sends into the message thread; the panel itself stays yours"), and a send that rides the existing replyMessage path (voice-swept, emailed like any reply, replyable like any message). Nothing marks the panel as shared; what you sent is what the thread shows.

## 4. What this hands the later epics

4E (health) reads the same execution facts across time. 5A (closeout) reads the evidence lists as the readiness half of the closeout story. 5C (case study) quotes shared reflections, which are already in the client's own thread.

## 5. AI

None. (A later nicety could draft the reflection from the notes through the proposals path; not this epic.)

## 6. The per-feature gate walk

- One new scoped table with both scope columns, membership RLS (practice-only read, the documented lens case), and cross-practice, cross-client, AND same-client matrix cases in the same PR.
- New person-data: none new; evidence rows point at artifacts that already exist, and the facts are computed from tables already walled.
- The share path reuses the messages machinery whole: self-authored, immutable, rate-limited, honestly emailed.
- Copy voice-swept; facts as history, confidence as prose, no grades, no percentages on people.
- Mobile: the panel folds at 390px as it does today; the evidence lists are lines, not tables.

## 7. CONFIRM gates for 4D

| # | Question | Recommendation |
|---|---|---|
| 4D-1 | readiness_evidence is practice-only read, inheriting the lens wall? | Yes. A receipt for a judgment the client cannot see is part of the judgment; sharing happens through the reflection, on purpose |
| 4D-2 | Execution facts computed from the record (sessions held, on-time completions, submissions), history beside judgment, practice-only? | Yes. It is the pillar you cannot do for them, so its evidence is exactly the weekly-rhythm facts, and the lib is gate-tested to never emit a grade |
| 4D-3 | The reflection sends into the ONE message thread via the existing reply path, no new client surface? | Yes. A coaching reflection is correspondence: composed, sent on purpose, answerable. A readiness page the client stumbles into is the thing this product refuses to be |
| 4D-4 | Evidence kinds: session, action_item, decision, deliverable? | Yes. The four artifact families the record already links elsewhere; outcomes stay linked through 2C's own evidence |
| 4D-5 | No confidence field; confidence stays prose in the note? | Yes. A confidence enum is a score wearing a coat |
