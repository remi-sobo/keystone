# Spec: Keystone V2 5B, engagement export and portability

**Parent:** `specs/keystone-v2.md` Phase 5 epic 5B, pulled forward out of Phase 5 on 2026-07-11. The trigger is contractual, not aesthetic: the revised SafeSpace agreement (Susan's Jul 11 review, `docs/seed/safespace-agreement-v2-draft.md` section 7) guarantees export "in commonly used formats, at any time and after the engagement ends, regardless of whether ongoing support services continue," and its 30-day termination clause means handover must be possible from early in the engagement. The V2 spec already called portability the thesis made literal; the agreement makes it owed.
**Grounded against:** the live codebase after Phase 4's 4A/4D/4E (migrations 0001 through 0025). The corpus discipline this spec reuses is 2E's: `lib/qaCorpus.ts` builds the record on the CALLER'S OWN session under RLS, so scope is enforced by the walls that already exist, and raw transcripts stay out by query (SECURITY.md 4.2).
**Status:** BUILT 2026-07-11, same day as the spec; all four gates approved as recommended (Remi, "recommendations approved"). No migration, as expected: `src/lib/exportRecord.ts`, the two routes, both surface blocks, `LIMITS.EXPORT_*`, and `e2e/export-gate.spec.ts`.
**Merge note (2026-07-11):** a parallel session built 5B the same day inside its Phase 5 run: a single-markdown paper export with self-taken gates. The merge kept THIS build, whose gates Remi decided in conversation, and absorbed the paper build's two good calls: the client route lives at `/export` (the closeout room links it) and the published closeout ships in the archive as `closeout.md`. The Phase 5 gate `e2e/export-record.spec.ts` and this spec's `e2e/export-gate.spec.ts` both hold against the one lib.
**Date:** 2026-07-11

---

## 1. What 5B is

One button that hands the caller a clean archive of the engagement record they are allowed to see. The client walks away with the record of their engagement, not a promise about it; the practice gets the same mechanism for handover and closeout. Two laws:

1. **The export scope IS the caller's visibility.** The archive is assembled by the caller's own session under RLS, the 2E corpus pattern. No export path ever widens what a session can read: a coachee's archive carries their own homework threads and never a teammate's (the 3C wall, mechanically), internal practice tasks never appear (the 0017 audience wall), drafts never appear (the 2A policy), unsent digests never appear (the 0024 policy). There is nothing to remember because there is nothing new to enforce.
2. **The shared record only, on both sides, in v1.** The practice's export is the same client-shaped archive, so a forwarded zip can never leak consultant-only material (the digest lesson: separate the paths in code). Raw transcripts, `ai_proposals`, readiness markers and evidence, `qa_exchanges`, notifications, and the audit log are out of every archive. A practice-only appendix is gate 5B-3, default no.

## 2. The archive (no new tables)

A zip, the commonly used format that needs no viewer, holding markdown documents plus the original files:

```
safespace-engagement-record-2026-07-11/
  README.md            what this is, engagement title, dates, who exported, what is included
  charter.md           published version + superseded history (2A visibility)
  decisions.md         the log, dated and attributed, supersession noted
  outcomes.md          measures, baselines, standing notes, evidence labels
  sessions.md          held and upcoming: purpose, agenda, moves, published notes
  homework.md          items with status history the caller can see (own threads only)
  deliverables.md      per deliverable: about, session link, version facts
  deliverables/        the actual files, latest version, original names
  digests.md           sent digests (0024 visibility)
  messages.md          the thread, authored and dated, anchors as plain labels
  closeout.md          the published closeout (merge note above)
  documents/           engagement documents shared with the client (the agreement)
  library.md + library/  client-visible resources and their attachments (gate 5B-1)
```

Markdown bodies come straight from the record (they are already markdown); files stream through the session-scoped storage policies that already gate every download. No content is rewritten, summarized, or voice-swept: this is the record, not a rendering of it. Zip assembly uses a small pure dependency (fflate) in a route handler, store-then-stream, with a size ceiling and an honest "too large, contact us" state rather than a silent truncation (the no-silent-caps rule); counts of what shipped go in README.md.

## 3. Surfaces

**Client:** an "Export your record" block on `/account` (the natural home: who you are in this room, since when, your data, the door out). One button, a plain sentence on what the archive holds, the download through the caller's session, pure RLS end to end (the no-service-role CI guard applies). 390px: it is a button and a paragraph.

**Practice:** an "Export the record" action on the engagement page header area, same archive shape, membership checked server-side first. Closeout (5A) will link to it; nothing here waits for 5A.

**Both:** rate-limited (new `LIMITS.EXPORT`, low: this is a heavy read). The practice export is audited (metadata only: engagement, artifact counts, byte size; never contents); the client export is deliberately not, per the activity-view rule adopted in the merge: a client exercising their export right never feeds the practice's activity fold.

## 4. What this hands the later epics

5A closeout gets its "the archive they keep" link for free. 5C case study gets nothing (different corpus, client approval flow). The termination path in the agreement gets its mechanism: handover is a button, not a scramble.

## 5. AI

None. The archive is the record verbatim; the one AI-adjacent rule is exclusion (proposals, Q&A exchanges, transcripts stay out).

## 6. The per-feature gate walk

- No new scoped table (documented here per the gate); no migration expected. If a ceiling forces an export-manifest table later, it carries both ids and matrix cases in that PR.
- New routes validate auth, resolve scope server-side, and read on the caller's session; client surface pure RLS; practice side service-role only after the membership check and only for storage streaming where the existing download routes already do.
- Person-data: nothing new is collected; the wall test is the point. The isolation matrix gains export-shaped assertions: a coachee's archive holds zero teammate activity rows, a client archive holds zero internal tasks, zero drafts, zero unsent digests, zero transcript bytes.
- Rate-limited, audited metadata-only, no PII in logs. Voice gate on the surface strings and README.md template. 390px verified on the client block.

## 7. CONFIRM gates for 5B

| # | Question | Recommendation |
|---|---|---|
| 5B-1 | Do client-visible library resources ship in the client archive? | Yes. The agreement licenses delivered materials perpetually for internal operations, and this also answers V1 gate 3 (library access after the engagement): access lapses gracefully because the archive keeps the copy |
| 5B-2 | Format: zip of markdown plus original files, or a single rendered PDF? | The zip. Markdown and original files are the honest commonly-used formats; a PDF renderer is a design project that can come later as an additive option |
| 5B-3 | Does the practice export add a practice-only appendix (consultant notes, internal tasks, readiness)? | Not in v1. Both sides get the shared record, so no zip can leak coaching material by being forwarded; revisit at closeout if the pilot shows the need |
| 5B-4 | Are messages included? | Yes. Both sides wrote the thread and both can already read all of it; leaving it out would make the archive a lesser record than the app |
