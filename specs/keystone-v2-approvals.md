# Spec: Keystone V2 5D, the Approvals primitive (pulled forward to Phase 2)

**Parent:** `specs/keystone-v2.md` Phase 5 epic 5D, pulled forward per the recommended build order because 2A (charter sign-off), 3D (deliverable acceptance), 5A (closeout), and 5C (case study consent) all consume it. Build the primitive once, early, so no epic invents its own.
**Grounded against:** the live codebase after 1A/1B and the agreement store (migrations 0001 to 0011).
**Status:** draft for Remi. CONFIRM gates in section 6.
**Date:** 2026-07-10

---

## 1. What an approval is

A durable, audited record of who agreed to what, when. It is what makes Keystone feel like a real delivery system and what protects the practice if scope is ever disputed. Three laws:

1. **Immutable once decided.** A decided approval is never edited and never deleted. Changing your mind is a new row; the history of assent is preserved the way the decision log preserves decisions.
2. **A person decides, not a role.** The record names the human (their membership row and email at decision time), because "SafeSpace approved" is not a fact; "Susan approved on July 12" is.
3. **Humane.** The pending state is an invitation, not a deadline; the decline is "not yet, and here is why," not a failure state. No nagging by default (reminders arrive with 4F, batched).

## 2. Schema (migration 0012)

```sql
create table approvals (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  engagement_id uuid not null references engagements(id) on delete cascade,
  -- What is being agreed to. The subject table owns its own versioning;
  -- an approval binds to ONE immutable version of a thing.
  subject_type  text not null check (subject_type in
                  ('charter','deliverable','stage','closeout','case_study','document')),
  subject_id    uuid not null,
  -- One line the approver reads: "the engagement charter, version 1".
  subject_label text not null,
  requested_by  uuid references auth.users(id) on delete set null,
  requested_at  timestamptz not null default now(),
  status        text not null default 'pending'
                check (status in ('pending','approved','not_yet','withdrawn')),
  -- Set exactly once, by the decider, at decision time.
  decided_at        timestamptz,
  decided_by        uuid references auth.users(id) on delete set null,
  decided_by_email  text,
  note_md           text,
  created_at    timestamptz not null default now()
);
```

- `withdrawn` is the practice pulling its own request back (a superseded charter version withdraws its pending ask); it is a status flip by the practice, audited, and the row stays.
- **RLS.** Read: practice members, and client members of that client (they must see what awaits them). Insert: practice only (`engagement.write`). Update: two narrow paths and nothing else, using the 0007 column-grant pattern (`revoke update ... grant update (status, decided_at, decided_by, decided_by_email, note_md)`):
  - a client member of that client may decide a PENDING row: `using (status = 'pending' and is_member_of_client(client_id))` `with check (status in ('approved','not_yet') and decided_by = auth.uid())`;
  - a practice member may withdraw a PENDING row: `with check (status = 'withdrawn')`.
  There is no update path for a decided row and no delete policy at all. The client surface stays pure RLS: the client's decide action IS an RLS-governed update, no service role.
- **Isolation matrix, same PR:** cross-practice and cross-client zero on reads; a client member cannot decide a sibling client's approval; a decided row rejects further updates (both sides); no session deletes.

## 3. Surfaces (thin by design; consumers own the framing)

The primitive ships with the smallest honest UI:

- **Client:** pending approvals appear where the subject lives (the charter page shows its own sign-off block; 3D will show acceptance on the deliverable). No new nav item, no approvals inbox in v1; Your Next Moves (2D) becomes the aggregator later.
- **Practice:** the engagement page shows each subject's approval state inline (pending since, approved by whom and when, not-yet with the note). Requesting is an action on the subject (the charter's "request sign-off" button), never a free-floating form.
- The decide action writes through the session under RLS, is audited (metadata: row id, status; never the note body), and the approved state renders as prose ("Approved by Susan Bird, Jul 12"), never a green badge wall.

## 4. The per-feature gate walk

- New scoped table with both ids, membership RLS through the hardened predicates, matrix extension in the same PR.
- No new routes beyond consumer surfaces; the decide path is pure RLS on the client surface.
- Person-data: the decider's email is denormalized onto the row deliberately, because the record must survive membership churn; listed in SECURITY.md as approval-record metadata.
- No AI surface. No new secrets. Copy through the voice gate ("not yet", never "rejected"). Mobile: the sign-off block renders at 390px inside its consumer.

## 5. Build shape

Ships in the same PR as 2A (the charter is the first consumer and proves the primitive end to end). Migration 0012, matrix cases, static gate spec, the decide/withdraw actions, and the inline state rendering used by the charter.

## 6. CONFIRM gates for 5D

| # | Question | Recommendation |
|---|---|---|
| 5D-1 | Who may decide a client-side approval: any member of that client, or named members only? | Any member of that client in v1, with the decider recorded by name; per-person addressing arrives with stakeholder modes (3G/2D). For the charter that means any of the four can sign for SafeSpace, and the record says exactly who did |
| 5D-2 | Decline semantics | "Not yet" with an optional note, never a terminal "declined". The practice re-requests after the conversation |
| 5D-3 | Does the practice side also sign its own subjects? | Not as an approval row in v1: publishing IS the practice's assent, recorded by `published_by` on the subject. One-sided rows keep the primitive simple; revisit if a buyer ever asks for countersign-in-app |
