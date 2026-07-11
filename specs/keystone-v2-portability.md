# Spec: Keystone V2 5B, engagement export and portability

**Parent:** `specs/keystone-v2.md` Phase 5 epic 5B: a real export the client keeps: charter, decisions, deliverables, outcomes, as a clean archive they own. The thesis made literal: we build the system, remove ourselves, and the record walks out the door with them.
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing move-to-Phase-5 instruction (gates taken as recommended). No migration.
**Date:** 2026-07-11

---

## 1. What 5B is

- **`lib/exportRecord.ts`:** one pure-of-walls builder that takes the CALLER'S Supabase client and composes the record as a single markdown file: charter, decisions in order, outcomes, deliverables, sessions, the sent digests, the published closeout. RLS shapes every export; on top of it the builder itself filters to published and sent shapes, so both sides export the SAME paper: what the client was given, never the practice's drafts.
- **Two routes, no service role anywhere:** `/export` on the client surface (pure RLS, linked from the closeout room: "download the whole record; it is yours") and `/engagements/[id]/export` on the practice surface (the same artifact, generated for handing over).
- **No storage bytes:** files stay downloadable in the app; this is the paper record. No AI.

## 2. CONFIRM gates for 5B (taken as recommended)

| # | Question | Recommendation |
|---|---|---|
| 5B-1 | One builder, the caller's session, both sides export identical paper? | Yes. The export IS the client's view; a wider practice export would be a different feature with a different name |
| 5B-2 | Markdown, not PDF? | Yes. Markdown is the portable, ownable format; a PDF pipeline is weight without trust gained |
