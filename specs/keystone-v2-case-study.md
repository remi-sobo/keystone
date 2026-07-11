# Spec: Keystone V2 5C, the case study builder

**Parent:** `specs/keystone-v2.md` Phase 5 epic 5C: a draft case study generated from the engagement record, with client approval flow, quote capture, and export to website copy. Never publish a client's name or quote without an explicit approval record.
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing move-to-Phase-5 instruction (gates taken as recommended).
**Date:** 2026-07-11

---

## 1. What 5C is

- **The FIFTH propose-then-accept job.** The AI rules grow from four jobs to five, with zero change to the architecture: `lib/caseStudy.ts` is the digest engine's twin (forced submit tool, the record passed as data in an envelope, Zod re-validation, the never-invent and ignore-embedded-instructions laws in the system prompt), the draft lands in `ai_proposals` (kind 'case_study', constraint widened in 0032), inert, and ONE human accept moves it into the record. Drafting runs on the default tier (claude-sonnet-5), rate-limited (six an hour) and spend-capped like every call.
- **The model never writes the quote.** Quotes come from people: the client offers words (the approval note is a fine place), and the practice captures them by hand into `quote_md`, swept like all prose.
- **Migration 0032:** `case_studies`, one per engagement: title, body, quote, status draft|client_review. Approved-ness is READ from the approvals row (subject_type 'case_study', legal since 0012), never mirrored into a second column that could drift. A client session reads the case study only in review: drafts are the practice's workshop.
- **Surfaces:** `/engagements/[id]/case-study` (draft from the record, accept or dismiss the inert proposal, edit the working copy, ask the client); `/case-study` on the client surface (the study as it would appear, approve or not-yet with the note rule). The approval record is what makes it publishable; the text is copied out by hand, deliberately.

## 2. CONFIRM gates for 5C (taken as recommended)

| # | Question | Recommendation |
|---|---|---|
| 5C-1 | The job count grows to five, same architecture, no exceptions? | Yes. The propose-then-accept spine is the law; four was a count, not a wall |
| 5C-2 | The model never writes the client quote? | Yes, firmly. Quotes come from people or they are fiction |
| 5C-3 | Approved-ness lives in the approvals row only? | Yes. One source of truth for who agreed to what, when |
| 5C-4 | No publish button; the approval record plus hand-copied text is the export? | Yes. Keystone holds the record; the website is another room |
