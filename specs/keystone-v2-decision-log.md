# Spec: Keystone V2 2B, the Decision Log

**Parent:** `specs/keystone-v2.md` Phase 2 epic 2B: the highest-value consulting artifact and the corpus that will make Q&A (2E) good.
**Grounded against:** the live codebase after 5D/2A (migrations 0001 to 0012). V1 keeps decisions inside `session_notes.decisions_md`, unstructured; the SafeSpace record already holds thirteen real decisions from the July 7 call in exactly that field, which is this build's seed.
**Status:** draft for Remi. CONFIRM gates in section 6.
**Date:** 2026-07-10

---

## 1. What the decision log is

Decisions as first-class rows: what was decided, when, by whom, with what context, tied to the session and workstream they came from. Two laws from the V2 spec, both structural:

1. **Decisions are immutable once logged.** The history of how thinking changed is the value. Changing course is a NEW decision that supersedes the old one; the old row never changes and never disappears.
2. **The log is the engagement record.** Client-visible by design, like the charter it reads against. The section 12 wall applies at the door: anything confidential never becomes a decision row in the first place.

Later epics lean on this table: 3A writes rows when an extraction's proposed decision is accepted (no double entry), 2E answers questions from it, 2F shows a workstream's recent decisions, 4A surfaces revisit dates.

## 2. Schema (migration 0013)

```sql
create table decisions (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  workstream_id uuid references workstreams(id) on delete set null,
  session_id    uuid references sessions(id) on delete set null,
  decided_on    date not null,
  title         text not null,            -- the decision, one plain sentence
  context_md    text,                     -- why, and where it came from
  decided_by_label text,                  -- "Susan and Remi", free prose
  revisit_on    date,
  -- Course changes point BACK: the successor carries the link, the
  -- superseded row never mutates. Read-time joins render the chain.
  supersedes    uuid references decisions(id) on delete set null,
  source        text not null default 'manual'
                check (source in ('manual','accepted_proposal')),
  proposal_id   uuid,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
```

- **Zero update policies and zero delete policies.** The immutability law is structural, not behavioral: after insert, no session can touch a row, and supersession lives on the successor so even that needs no update. (The approvals table needed a narrow update path for the decide; decisions need none at all, the cleanest table in the schema.)
- **`decided_by_label` is free prose, not a member reference** (CONFIRM 2B-2): decisions predate logins, are often joint ("Susan and Remi together"), and sometimes belong to people who will never have a seat. The audit trail already records which authenticated user LOGGED the row.
- RLS read: both walls (practice, and client members of that client). Insert: `engagement.write`. The hardened predicates carry revocation for free.
- **Isolation matrix, same PR:** cross-practice and cross-client zero; client insert wall; the no-update and no-delete assertions on both sides.

## 3. Surfaces

**Practice: a Decision log section on the engagement page** (between the review queue and Deliverables): the list newest-first (decision, date, who, workstream tag, superseded strikethrough with a "superseded by" pointer, revisit date when set), and the add form: decision, date (defaults today), who, context, optional workstream, optional session, optional revisit date, optional "supersedes" pick. No separate practice page until the list earns one.

**Client: `/decisions`,** linked from the charter page and a line on Home under the charter card ("Decisions: 13 logged, latest Jul 7"). Same list, read-only, rendered as calm history: date, decision, who, context on expand. Superseded rows show struck through with their successor, because how thinking changed is trust. 390px first: the list is a single column already.

## 4. Seed graduation (the thirteen)

On build, the July 7 decision log graduates from `session_notes.decisions_md` prose to thirteen `decisions` rows: `decided_on` 2026-07-07, tied to the July 7 session, `decided_by_label` from each attribution ("Susan", "Susan and Remi together", "confirmed on call"), context carrying the source line, workstream links where one clearly owns it (fundraising-first to Build the system, pitch practice to Develop the leaders). The session note keeps its prose untouched; it is the record of the call, and the log is the index born from it. Idempotent SQL, checked in, applied live.

## 5. AI

None yet. 3A wires extraction-accepted decisions into this table (`source = 'accepted_proposal'`, `proposal_id` set); the columns land now so 3A adds no migration.

## 6. CONFIRM gates for 2B

| # | Question | Recommendation |
|---|---|---|
| 2B-1 | Client-visible by default? | Yes, all rows. The engagement record holds decisions; the section 12 wall gates what may become a decision at all, not who reads it. A practice-only decision is an internal task or a readiness note, not a log entry |
| 2B-2 | Who decided: free-text label or member reference? | Free text. Joint decisions and pre-login people are the norm; the audit log already knows which user logged the row |
| 2B-3 | Supersession: pointer on the successor, rows never mutate? | Yes. Zero update policies is the strongest immutability there is |
| 2B-4 | Revisit dates: where do they surface in v1? | Stored and shown on the row only. 4A's action queue and 2D's next moves pick them up when they land; no reminders before 4F exists |
