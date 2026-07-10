# Spec: Keystone V2, engagement search (the Phase 2 closer)

**Parent:** `specs/keystone-v2.md`, additions list item 4: plain keyword search across the record, distinct from AI Q&A. Sometimes you just want to find the thing. Small, high-use.
**Grounded against:** the live codebase after 2E (migrations 0001 to 0016). Everything searchable already sits behind proven walls, and 2E just established the pattern this reuses: reads on the caller's own session, so the search scope IS the caller's visibility.
**Status:** approved by Remi 2026-07-10 (section 4 gates decided as recommended) and built the same day: lib/recordSearch.ts, the find box on /ask ("Ask or find") and on the engagement page. Phase 2 closed.
**Date:** 2026-07-10

---

## 1. What it is

One input, exact words, grouped results with links: the charter, decisions, session notes, outcomes, homework, deliverables, workstream notes, and messages, each hit shown as a snippet around the match. No model, no interpretation, no cost per query; the mechanical sibling of /ask for when the question is "where did we write that" rather than "what does it mean."

## 2. Mechanics

- **The caller's session runs every query** (the 2E pattern): a client member finds only shared and published material, the practice finds its fuller record, and the standing matrix is the proof. No search index holds a copy of anything, so there is nothing new to wall.
- **Postgres ILIKE** with escaped wildcards, minimum two characters, capped at 10 hits per kind, snippets cut to about 160 characters around the first match. No full-text-search infrastructure in v1 (CONFIRM 2S-2): an engagement's record is thousands of rows at most, ILIKE at this scale answers in milliseconds, and tsvector columns would be speculation; the flag to revisit is written here.
- Messages are in scope for the asker's own visible thread (CONFIRM 2S-3); raw transcripts are NOT (the same section 4.2 exclusion Q&A honors, checked by the same kind of gate).
- No migration, no new tables, no rate limit needed (no model call, no email; plain reads the pages themselves already do).

## 3. Surfaces

**Client:** the `/ask` page becomes "Ask or find": the existing AI ask block, and above it a plain find box, clearly labeled ("Find exact words" beside "Ask a question"), because the two tools answer different moods about the same record (CONFIRM 2S-1). Results grouped by kind, each linking to its surface. The Home card line already points here.

**Practice:** a find box beside "Ask the record" on the engagement page, same component, per-engagement scope. Cross-engagement practice search belongs to 4A's era, not this epic.

Both at 390px first; results are a single column of rows.

## 4. CONFIRM gates

| # | Question | Recommendation |
|---|---|---|
| 2S-1 | One page for find and ask, or a separate /search? | One page. Same record, two moods; a fifth-plus-one nav page for a text input is ceremony. The labels keep them distinct |
| 2S-2 | ILIKE now, full-text-search infrastructure later? | ILIKE. The record is small, the walls stay untouched, and FTS lands when a real engagement record outgrows it |
| 2S-3 | Messages in scope? | Yes, the asker's own visible thread; finding "the link Jasmine sent" is half the use case |
