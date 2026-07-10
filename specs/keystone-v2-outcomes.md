# Spec: Keystone V2 2C, outcomes and success measures

**Parent:** `specs/keystone-v2.md` Phase 2 epic 2C: progress as value, not just stage.
**Grounded against:** the live codebase after 2D (migrations 0001 to 0014), the published SafeSpace charter (its "Where this ends" and "How we will know it worked" sections), and the seed doc's section 4 table (eight outcomes with baselines and evidence-when-done), which the seed doc marks "feeds V2 2C".
**Status:** draft for Remi. CONFIRM gates in section 6.
**Date:** 2026-07-10

---

## 1. What 2C is, and the three humane laws

The engagement's own success measures, each carrying: where it started (the baseline), what done looks like (the target), where it stands today (descriptive prose, dated), and the EVIDENCE, links to real artifacts. Three laws from the V2 spec, all structural here:

1. **Outcomes derive from the charter's success section**, never a separate invented list, or the two drift. The SafeSpace eight are literal derivations of the charter's six outcomes plus the readiness frame; the practice surface renders the charter's success prose beside the outcomes list so drift is visible at a glance.
2. **Evidence is artifacts, never self-reported numbers.** An evidence link points at a deliverable, a session held, a completed homework item, or a logged decision. "Confidence" is prose the consultant writes and dates, never a percentage, never a bar.
3. **These are the ENGAGEMENT's outcomes, never the client's business metrics.** Dollars raised is BloomOS; "a documented fundraising strategy exists in the hub" is Keystone. The boundary line appears in the editor's help text.

## 2. Schema (migration 0015)

```sql
create table outcomes (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  workstream_id uuid references workstreams(id) on delete set null,
  title         text not null,          -- the outcome, one plain sentence
  baseline_md   text,                   -- where it started, honestly
  target_md     text,                   -- what done looks like (evidence-when-done)
  standing_md   text,                   -- where it stands, descriptive prose
  standing_updated_at timestamptz,
  reached_on    date,                   -- set when it is real; rendered as history
  sort          int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table outcome_evidence (
  id            uuid primary key default gen_random_uuid(),
  outcome_id    uuid not null references outcomes(id) on delete cascade,
  engagement_id uuid not null references engagements(id) on delete cascade,
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  kind          text not null check (kind in ('deliverable','session','action_item','decision')),
  ref_id        uuid not null,
  note          text,
  added_by      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
```

- RLS on both: read on both walls (the client sees their outcomes and the evidence trail; that IS the value), writes practice-only (`engagement.write`). Evidence rows are links, so the practice may also delete a mistaken one (the artifact itself is untouched); outcomes rows update but never session-delete (retiring an outcome is a charter conversation, then a new version, not a quiet row removal).
- **`reached_on` renders as history** ("reached Oct 3"), never as a completion percentage across the list. No progress bars anywhere on this surface (CONFIRM 2C-2).
- **Isolation matrix, same PR:** both walls on both tables, client write walls, and the evidence ref must belong to the same engagement (enforced in the action, asserted in the matrix as an app-layer note; the ref is validated server-side before insert, the same never-trust-a-pointer rule the builder and documents use).

## 3. Surfaces

**Practice, on the engagement page:** an Outcomes section: the list in sort order (title, baseline in quiet text, target, the dated standing note, evidence links, reached-on when set), an edit form per row (standing note is the ten-second act; baseline and target rarely change), an add form, and evidence attach (kind pick, then a select of that engagement's real deliverables, held sessions, done homework, or decisions). The charter's success prose renders in a quiet fold above the list, the anti-drift mirror.

**Client: `/outcomes`,** linked from the charter page ("Where this ends, tracked as it happens") and a line on the Home charter card. Read-only: each outcome as a card row: title, "from" baseline, "to" target, the consultant's dated standing note, the evidence as links into the surfaces the client already has (/deliverables, /sessions, /homework, /decisions), and "reached Oct 3" when true. Calm, prose-first, zero numbers about people. 390px first.

## 4. Seed graduation (the SafeSpace eight)

On build, seed doc section 4 graduates: eight outcomes rows for the SafeSpace engagement, in the table's own words (baseline "No CRM; Excel and Google Docs", target "Pipeline live with stages, journeys mapped for top donors", and so on), workstream-tagged where one owns it, sort in the table's order. Standing notes start empty; they are the pilot's to write. Idempotent SQL, checked in, applied live.

## 5. AI

None. 2E's Q&A will read outcomes as part of the record; nothing here writes by machine.

## 6. CONFIRM gates for 2C

| # | Question | Recommendation |
|---|---|---|
| 2C-1 | Evidence kinds: deliverable, session, action item, decision? | All four. They are the record's four artifact shapes today; digests join later if wanted |
| 2C-2 | Any aggregate progress display ("5 of 8 reached")? | No. Reached-on renders per outcome as history; an aggregate is a grade on the engagement and drifts toward a grade on the people. The list speaks for itself |
| 2C-3 | Seed the eight section 4 outcomes now? | Yes, in the table's own words, standing notes left empty for the pilot to fill |
| 2C-4 | Client placement: /outcomes linked from charter and Home? | Yes; the nav stays at five tabs, and outcomes are the charter's companion surface |
