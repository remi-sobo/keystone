# Spec: Keystone V2 2A, the Engagement Charter

**Parent:** `specs/keystone-v2.md` Phase 2 epic 2A, the spine most of V2's client value hangs off: outcomes (2C) derive from its success section, the decision log and Q&A read against it, closeout (5A) closes against it.
**Grounded against:** the live codebase after 1A/1B, the agreement store (0011), and the seeded SafeSpace content. The full charter prose already lives in the live library as the pinned resource "Engagement charter, draft" (seeded in Phase 0 from `docs/seed/keystone-safespace-seed.md` section 3, fee line included per gate 9), so this build starts from real content, not lorem ipsum.
**Status:** approved by Remi 2026-07-10 (section 7 gates decided as recommended) and built the same day: migration 0012, the editor, the client page, the Home card, and the SafeSpace graduation (charter v1 published, sign-off pending).
**Date:** 2026-07-10

---

## 1. What the charter is

The engagement's constitution, client-facing: why this engagement exists, what is being built, the outcomes, how the work runs, what the client owns at the end, roles, how success is known, and, most valuable and most skipped, **what is explicitly not included**. It is the standing answer to scope creep and the BloomOS-bleed problem, and it is the one document both sides sign off on. Versioned from day one, because scope changes and the history is the point.

Boundary law: the charter describes the engagement, never the client's operational plan.

## 2. Schema (migration 0012, shared with 5D)

```sql
create table engagement_charters (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  version       int not null,
  body_md       text not null,
  status        text not null default 'draft'
                check (status in ('draft','published','superseded')),
  published_at  timestamptz,
  published_by  uuid references auth.users(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (engagement_id, version)
);
-- At most one live published version per engagement.
create unique index engagement_charters_one_published
  on engagement_charters (engagement_id) where (status = 'published');
```

- **One markdown body in v1** (CONFIRM 2A-1). The seeded SafeSpace charter is already excellent structured prose; a section-per-column schema would force a data model on writing that 2C can extract later when outcomes need it. The body is voice-swept on save like every shipped string.
- **Versioning is append-only.** Editing a draft updates it in place; editing a PUBLISHED charter creates the next version as a draft. Publishing version N marks version N-1 `superseded` and withdraws its pending approval (5D). Published and superseded bodies are never edited; there is no delete policy.
- **RLS.** Practice reads all versions and writes drafts (`engagement.write`). A client member reads ONLY published and superseded versions of their own client's engagement: drafts are invisible by policy (`status <> 'draft'`), the engagement_drafts lesson applied in-table since versions must live in one table to version cleanly. Update policy confined to draft rows for the practice; published rows are immutable to every session (status flips ride the publish action through the service role after the check, keeping the one-live-version transition atomic).
- **Isolation matrix, same PR:** client member reads zero drafts of their own charter, all published/superseded of their own, zero of a sibling client or foreign practice; the write walls; no deletes.

## 3. Surfaces

**Client: `/charter`.** No new nav item (the client mobile tabs sit at the five-item max); the room's Home links to it from a charter card ("the agreement that governs this room, signed by...", or the quiet pre-publish empty state). The page renders the published charter, its version and date, and the 5D sign-off block: pending shows a calm "read it, then sign here" with approve and not-yet (optional note); decided shows "Approved by Susan Bird, Jul 12". Superseded versions list below as history links. 390px first.

**Practice: `/engagements/[id]/charter`.** The editor: current draft (markdown textarea, voice-swept on save), preview of the published version, publish (with the one-line confirmation that this supersedes version N-1 and re-requests sign-off), and request sign-off for a published version that has none. The engagement page grows a charter line in its header area: version, sign-off state, link to the editor.

**Fee (gate 9, decided):** the fee appears in the charter body and nowhere else. The seeded body already carries it; the editor's help text names the rule so future charters follow it.

## 4. Seed migration (SafeSpace)

On build, the pinned library resource graduates: insert `engagement_charters` version 1 for the SafeSpace engagement with the seeded charter body (published, `published_by` Remi), create its pending 5D sign-off request addressed to the client, and remove the placeholder resource "Engagement charter, draft" from the library (it was seeded explicitly as the stand-in until 2A; CURRENT.md records the graduation). The deliverables-ledger resource stays; its home is 3D.

## 5. AI

None in this epic. The charter is human-written; 2F's AI-drafted "why we're here" notes and 2C's derived outcomes come later and will read the charter, not write it.

## 6. The per-feature gate walk

- New scoped table, both ids, hardened predicates, matrix in the same PR (including the in-table draft wall).
- New routes: client page pure RLS; practice editor service-role only for the publish transition, after the check.
- Person-data: none new (the sign-off record is 5D's).
- Copy and body through the voice gate; growth described, never scored. Mobile 390px on both new pages.

## 7. CONFIRM gates for 2A

| # | Question | Recommendation |
|---|---|---|
| 2A-1 | Body shape: one markdown document, or structured sections? | One markdown body in v1; 2C extracts structure when outcomes need it. The SafeSpace charter already reads beautifully as one document |
| 2A-2 | Does publishing version N+1 void version N's sign-off? | Yes. A sign-off binds to the version that was read; the new version's request goes out with a one-line "what changed" note in the request label |
| 2A-3 | Can the client see superseded versions? | Yes, as quiet history below the live charter. The history of how scope evolved is trust, not clutter |
| 2A-4 | Who can publish: owner only, or any consultant? | `engagement.write` (both roles) in v1, matching who can already shape engagements; the publish is audited by name |
