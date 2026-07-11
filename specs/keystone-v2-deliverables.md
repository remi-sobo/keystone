# Spec: Keystone V2 3D, the deliverable lifecycle

**Parent:** `specs/keystone-v2.md` Phase 3 epic 3D: preview, versions, "what this is for," and acceptance. The V2 spec's own humane-data rule stands: passive per-person "viewed by" tracking is CUT, surveillance-adjacent and anxiety without value.
**Grounded against:** the live codebase after 3B. A deliverable today is a file or link on the brass timeline with a title and a note: no purpose prose, no session link, no versions, no acceptance. Two rails already exist for this epic: the 5D approvals table listed `deliverable` among its subject types from the day it shipped (the decided-once trigger stamping identity from the JWT, the humane `not_yet` decline), and the storage discipline (path-scoped read policies, signed uploads, session-client downloads) needs no change.
**Status:** draft for Remi. CONFIRM gates in section 7.
**Date:** 2026-07-10

---

## 1. What 3D is

A deliverable grows from an artifact into a handoff. Three moves:

1. **It explains itself.** One markdown field, "About this deliverable" (what it is for and how to use it), written by the practice, rendered on both sides. Plus an optional link to the session it came from.
2. **It remembers its versions.** Replacing a FILE deliverable keeps the old object and records it in an append-only history; a link deliverable is just edited, never versioned (the V2 spec's own rule: do not force versioning on links).
3. **It can be accepted, deliberately.** The practice requests acceptance on a deliverable when acceptance means something; the client accepts or answers "not yet" with a note, through the SAME 5D approvals machinery as the charter sign-off: the decided-once trigger, the JWT-stamped identity, the one decision per request. "Ask a question" stays what it already is, the messages thread; a third channel would fragment the one calm thread (3E anchors it later).

## 2. Schema (migration 0022)

```sql
alter table public.deliverables
  add column about_md text,
  add column session_id uuid references public.sessions(id) on delete set null;

create table public.deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  engagement_id uuid not null, practice_id uuid not null, client_id uuid not null,
  version int not null,
  storage_path text not null,
  replaced_at timestamptz not null default now(),
  replaced_by uuid references auth.users(id) on delete set null,
  unique (deliverable_id, version)
);
```

- **Approvals: zero schema change.** `subject_type = 'deliverable'` has been legal since 0012; the request, the decide, the trigger, and the withdraw all exist. This epic only gains surfaces and two 4F emissions.
- **`deliverable_versions` policies:** read admits both sides (the history of what shipped is part of the record); insert admits `engagement.write` (the replace action records the outgoing version before the pointer moves); ZERO update and ZERO delete policies (history is history). The replace action validates the new storage path inside the engagement's own folder exactly as `createDeliverable` does today.
- **Downloads:** the client keeps downloading the LIVE file through the existing pure-RLS route; old versions download on the practice side only at launch (a client-side history download is a fast follow if the pilot wants it, not a wall change since the read policy already admits the rows). The client download route gains the `?view=1` inline option the newer routes already have, which is the honest version of "preview."
- **Isolation matrix, same PR:** cross-practice and cross-client walls on `deliverable_versions`; append-only asserted (update and delete fail for every session); a client session cannot insert a version row; an approvals row with `subject_type='deliverable'` decided by the client stamps the decider from the JWT exactly as the charter case already proves (re-asserted for this subject type). Static gate `deliverable-lifecycle.spec.ts`; the table joins the ratchet.

## 3. Surfaces

**Practice (engagement page, deliverables section):**
- The add form gains About (markdown) and an optional session select; existing deliverables get an edit fold for About and the session link.
- Per FILE deliverable: **Replace the file** (signed upload as today; on success the outgoing object becomes version N in the history, the row points at the new object, nothing is deleted) and the version list with practice-side downloads.
- Per deliverable: **Request acceptance** (creates the 5D approval with `subject_label` naming the deliverable; disabled while one is pending or approved, the charter discipline). The acceptance state renders beside the deliverable: requested, accepted by whom, or "not yet" with the client's note.

**Client (/deliverables):**
- Each deliverable renders its About prose and its session link; file cards gain View (inline) beside Download.
- A pending acceptance renders as the same calm decide block the charter uses: **Accept** or **Not yet, with a note** (the note is required on not-yet; a decline without words is a shrug). One decision per request, stamped by the trigger, never editable after.
- Version history shows as facts ("version 2 replaced March 4"), no downloads at launch.

**4F emissions:** requesting acceptance notifies the client team (`approval_waiting`, href `/deliverables`); the decision notifies the practice team (new kind `approval_decided`, added to the check in 0022). Both batch like everything else.

## 4. What this hands the later epics

5A closeout reads acceptance states as the engagement's handoff record. 3E gives deliverables message anchors ("ask a question" lands exactly where it belongs). 2C outcome evidence already links deliverables; accepted ones simply weigh more in prose.

## 5. AI

None.

## 6. The per-feature gate walk

- One new scoped table with both scope columns, membership RLS, cross-practice, cross-client, and append-only matrix cases in the same PR; approvals re-asserted for the new subject type.
- New person-data: an acceptance note, on the existing approvals wall, decided-once, never editable; no viewed-by tracking exists anywhere.
- Client surface stays pure RLS (the decide rides the existing approvals update policy and column grant; downloads ride the session client); replace and request are practice moves, service role only for storage after the check.
- Copy voice-swept; acceptance renders as facts and prose, never a score or a red badge.
- Mobile: the client deliverable card with About and the decide block at 390px is the felt surface.

## 7. CONFIRM gates for 3D

| # | Question | Recommendation |
|---|---|---|
| 3D-1 | Acceptance rides the existing 5D approvals (decided-once, JWT-stamped, `not_yet` as the humane decline), and "ask a question" stays the messages thread? | Yes. One approval machine for the whole product, and one calm thread; a parallel question channel fragments both |
| 3D-2 | Acceptance is requested deliberately per deliverable, never auto-created on ship? | Yes. Asked-for acceptance means something; ceremony on every PDF trains everyone to click through it |
| 3D-3 | Versions for FILE deliverables only, append-only, both sides read the history, live file only for client downloads at launch? | Yes. Links edit, files version; the history is record, not archive-browsing, until the pilot asks |
| 3D-4 | "What this is for" and "how to use this" as ONE markdown field (About), not two boxes? | Yes. One good paragraph beats two thin fields; the editor already exists |
| 3D-5 | Viewed-by tracking stays cut? | Yes, firmly. The V2 spec's own humane-data rule; growth is rendered as history, never surveillance |
