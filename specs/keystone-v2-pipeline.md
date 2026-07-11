# Spec: Keystone V2 4G, pipeline-lite behind the flag

**Parent:** `specs/keystone-v2.md` Phase 4 epic 4G: a light pre-engagement pipeline (lead, discovery, proposal, verbal yes, paused, closed) that converts a won deal into an active engagement via the builder. Product-tier; SOBO uses Trellis.
**Standing decision:** CONFIRM V2-5, decided by Remi 2026-07-09: pipeline is product-tier and flagged off for SOBO. Behind a practice-level feature flag SOBO leaves off; Trellis stays the business brain.
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing finish-Phase-4 instruction (gates taken as recommended).
**Date:** 2026-07-11

---

## 1. What 4G is

- **Migration 0028:** `practices.pipeline_enabled` (default FALSE: every practice, including SOBO, starts with it off) and `deals`: practice-only (no client_id; there is no client yet, that is the point), stages as listed plus `converted`, a link to the engagement draft it became, and deliberately NO money columns: no fee, no amount, no value. The bright line from V2-5 is structural: this table cannot become a second place to track SOBO's money because it has nowhere to put money. Person-data minimized to contact name and email.
- **RLS:** the engagement_drafts discipline: practice members read, engagement.write writes, no delete (closed is a stage). The matrix proves the client member reads zero and cannot write, and practice B reads zero of practice A.
- **/pipeline:** exists as a route, not in the nav (nav space is for rooms SOBO uses; a buyer's instance adds the link when the flag flips, its own follow-up). With the flag off the page says so honestly and points at Trellis. With it on: deals grouped by stage, an add form, a stage move, and Convert on a verbal-yes deal, which creates an engagement draft titled after the deal, stamps the deal `converted` with the draft link, and lands in the builder.
- **Fail closed:** every action re-reads the flag server-side and refuses when off; the page copy is not the enforcement.

## 2. CONFIRM gates for 4G (V2-5 already decided; the rest taken as recommended)

| # | Question | Recommendation |
|---|---|---|
| 4G-1 | No money columns, structurally? | Yes. The V2-5 bright line enforced by the schema, not by discipline |
| 4G-2 | Flag default false, actions fail closed on it? | Yes. SOBO's instance never runs pipeline code paths, even by URL |
| 4G-3 | Conversion goes THROUGH the builder (a draft, not a live engagement)? | Yes. 1B is the one door into the system of record |
