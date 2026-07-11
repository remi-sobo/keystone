# Spec: Keystone V2, the client profile

**Parent:** `specs/keystone-v2.md` Phase 4 (Practice OS) territory; a harvest-born epic, grounded after Phase 5. The spec's own architecture sketch (`specs/keystone.md` section 5) reserved `/clients/[id]` from day one; the route was never built. This epic builds it: a steady-state view of the ORGANIZATION, not just the current engagement, the room a consultant opens to remember who a client is and where the relationship stands.
**Grounded against:** the live codebase after the V2 close. `/clients` is a flat list today (name, status, engagement titles). Every fact a profile needs already lives behind the practice wall: engagements, workstream arcs, the health phrase (`lib/health.ts`), sessions, deliverables, decisions, messages, the agreement document, digest cadence, and the client roster (`client_members`). What is missing is one page that gathers them per client, and a small set of org-level facts the schema does not yet hold.
**Status:** BUILT 2026-07-11 (all five gates approved as recommended). Migration 0034 (the four client-facts columns), `/clients/[id]` the profile page, `/clients` upgraded with the health phrase per row, `src/lib/healthInputs.ts` the shared health assembly (the /engagements list refactored onto it so momentum reads the same on both surfaces), the isolation matrix extended (owner writes the record, a client member cannot, cross-client and cross-practice reads stay zero), `e2e/client-profile.spec.ts`. 290 gate assertions green; the live matrix passes on scratch Postgres 16; typecheck, lint, build clean. The fee shows on the profile per CP-2, logged below as the gate-9 amendment. 390px live run owed with the other rings (blocked on the auth allow-list like every surface).
**Date:** 2026-07-11

---

## 1. What the profile is

One practice-side page, `/clients/[id]`, reached by clicking a client on `/clients`. It answers "who is this client, and where does the relationship stand" in the first screen, and holds the current engagement inside a wider frame: the org in general, not only the work in flight.

The steady-state view, in sections, top to bottom:

1. **The header.** Client name in Cormorant, status, "client since" (the relationship start), and the practice's own one-line relationship note. Quiet, warm, the way a profile should open.
2. **At a glance.** The org in one strip: number of engagements (active and past), the current health phrase per active engagement (reused from `lib/health.ts`, not recomputed), tenure, and the digest cadence. If gate CP-2 approves, the engagement fee line sits here.
3. **The people.** The client roster from `client_members`: each member's name, email, role, and posture (buyer or coachee, the section 3 personas), the primary contact marked, and a quiet "Message the team" shortcut into the existing thread. Contact is the thing a consultant reaches for most and the flat list hides today.
4. **Engagements.** Every engagement this client has had, active first, each with its health phrase, a compact workstream-arc summary, start and end dates, the fee line (gated), and a link into mission control. A client with one engagement sees one; the section is built to hold more, because a returning client is the point of a profile.
5. **Where we're at.** The health fact lines (last session, homework on time this month, digest consistency, reply lag both ways) rendered as prose under the phrase, exactly as the engagement page renders them. Momentum across time, the 4E reading, gathered per client.
6. **The record at a glance.** Honest counts, not scores: sessions held, deliverables shipped, decisions logged, the current charter version and its sign-off state, whether the agreement is on file. Each count links to its full surface. This is the "watch the fee working" view turned toward the consultant.

Everything is a read. The profile writes nothing except, if gate CP-3 approves, the light org-level fields (relationship note, primary contact, website), which are edited in place by the practice.

## 2. What the profile is NOT

- **Not a money dashboard.** Keystone holds no revenue data by decision, and this epic does not add any. The only money that can appear is the engagement fee already captured in `fee_display`, and only if CP-2 approves surfacing it here. Cross-venture revenue (money across SOBO, Trellis, Ambition Angels, portfolio) stays in Trellis, the business brain, per spec section 2; the profile points there rather than pretending to answer it.
- **Not client-visible.** The profile is a practice-only surface. A client member never sees it, never sees another client, and never sees the fee through it. The wall is unchanged.
- **Not a score on the client or their people.** Counts render as history, health renders as voice, the humane-data rule holds. No percentage, no grade, no red, no ranking of clients against each other.
- **Not a new home for anything.** It gathers links into the surfaces that already own each fact; it does not become a second place to edit engagements, homework, or deliverables.

## 3. The money question (the gate 9 revisit, logged not silent)

Remi's ask named "how much money is coming from them" as a headline factor. That collides with two standing decisions, and this section states the collision plainly rather than quietly working around it:

- **CONFIRM 9 (decided):** the fee shows in the charter, nowhere else in-app. `fee_display` is text, rendered today only in the draft builder and the charter body.
- **Spec section 2:** cross-venture money is never productized in Keystone.

Remi's call on this epic (2026-07-11): **show the engagement fee on the profile.** That is a deliberate expansion of gate 9 from "charter only" to "charter and the practice-side profile," and it is recorded here as a proposed gate-9 amendment (gate CP-2), not applied silently. The narrowing that keeps it safe: the profile is practice-only, so widening fee visibility here never reaches a client, and the fee shown is the engagement's own `fee_display`, never a computed cross-engagement or cross-venture total. Anything beyond a single engagement's fee (contract value over time, paid-to-date, revenue per client) would be new money data and a new boundary crossing; it stays out and stays a Trellis question, with a one-line pointer where a consultant might look for it.

## 4. Schema

Two shapes, the second gated:

- **None required for the composition.** Sections 1, 2 (minus fee), 3, 4, 5, and 6 read tables the practice session already reads in full under standing RLS. A profile that only composes is a no-migration epic.
- **A light client-facts migration (gate CP-3), if approved.** Org-level facts the schema lacks, added to the already-scoped `clients` table: `relationship_note` (text, the practice's one-line why-this-client), `primary_contact_member_id` (fk into `client_members`, on delete set null), `website` (text), `relationship_started_on` (date, distinct from the row's `created_at`, because a client may predate their Keystone record). Columns only, on a table the isolation matrix already proves; writes ride `keystone_can` through the session; no new policy, and the same-practice cross-client and cross-practice cases stand unchanged. The gate walk still requires the isolation test to name these columns so a future reader sees them covered.

Member-level contact depth (phone, title) is deferred by recommendation (gate CP-5): email and role carry the roster today, and phone or title is a real field a real pilot week will ask for with specifics, not a guess made now.

## 5. Surfaces and reuse

- **`/clients`** gains a link per client into `/clients/[id]` and, per the profile's own summary, the health phrase on each list row (reusing `lib/health.ts`), so the list itself starts to answer "where does each stand."
- **`/clients/[id]`** is the new page: server component, reads on the caller's own practice session under RLS, resolves the client server-side and returns a clean not-found if the client is outside the caller's practice (RLS returns zero rows, the page 404s, never a leak). Health is computed with the same inputs the engagements page assembles; the composition is factored so both pages share it rather than drifting.
- **No client surface changes.** The client experience is byte-identical before and after this epic.

## 6. AI

None. The profile is composition and derivation; no model writes any part of it. Health phrases are the deterministic 4E rules, not generation.

## 7. The per-feature gate walk

- **New route:** validates auth (`requirePracticeMember`), resolves the client scope server-side, every query scoped to the caller's practice, reads on the session under RLS (the client-list precedent), a clean 404 when the client is out of scope.
- **Scoped table change (only if CP-3):** columns on `clients`, which carries `practice_id` and is matrix-proven; the same PR extends the isolation test to name the new columns and assert a cross-client and cross-practice read still returns zero.
- **New person-data:** none beyond what exists; the roster is already minimized and on the practice wall. The relationship note is practice-authored prose about the engagement, never governance or board material (the board-bleed line holds).
- **Money:** the fee, if CP-2 approves, is the existing `fee_display` on a practice-only surface, never a client surface, never a computed total. No new money data enters the schema.
- **Copy and any AI output:** none generated; all static copy voice-swept, no em dashes, no banned words, growth and standing described, never scored.
- **Mobile:** the profile verified at 390px; the sections stack, the roster and engagement cards reflow, nothing new to invent past the existing card patterns.

## 8. CONFIRM gates for the client profile

| # | Question | Recommendation |
|---|---|---|
| CP-1 | `/clients/[id]` as a practice-only, composition-first profile reusing `lib/health.ts`, reads on the session under RLS with a clean 404 out of scope? | Yes. The spec reserved the route; the data already exists behind the wall; composition is the honest first build |
| CP-2 | Show the engagement fee (`fee_display`) on the profile, amending gate 9 from "charter only" to "charter and the practice-side profile"? | Yes, per Remi's call, logged as a gate-9 amendment: practice-only so no client ever sees it, single-engagement fee only, never a cross-venture total; cross-venture money stays a Trellis pointer |
| CP-3 | Add the light client-facts migration (relationship note, primary contact, website, relationship-started date) with the isolation test naming the columns in the same PR, or compose from existing data only? | Add the four fields. They are the org-level facts a profile is for and the flat list cannot hold; the change is columns on an already-proven table |
| CP-4 | The profile aggregates across ALL of a client's engagements (active and past), not just the current one? | Yes. A steady-state org view spans engagements; a returning client is exactly why a profile beats an engagement page |
| CP-5 | Member-level contact depth (phone, title) deferred until the pilot asks with specifics? | Yes. Email and role carry the roster now; add the exact fields a real week names, not a guessed set |
