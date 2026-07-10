# Spec: Keystone V2 1B, the Engagement Builder (light)

**Parent:** `specs/keystone-v2.md` Phase 1, epic 1B. Second standalone V2 spec.
**Grounded against:** the live codebase after 1A (migrations 0001 to 0009, the seed files, the client surface reads). Every V1 claim below was read from the code.
**Status:** approved by Remi 2026-07-09 (the four section 9 gates decided as recommended) and built the same day: migration 0010, the drafts list on `/engagements`, `/engagements/drafts/[id]`, and publish.
**Date:** 2026-07-09

---

## 1. Purpose

Today an engagement is born from `seed.sql`: engagement row, workstreams, homework, resources, all hand-written SQL. 1A opened the doors for people; 1B opens the room itself. Create an engagement from the UI: client, title and dates, people and roles, workstreams with starting stages, cadence in plain words, the fee line for the future charter, then publish and (optionally) invite everyone in one motion.

The V2 spec's design law for this epic: **a resumable draft, not a wizard.** Scoping a real engagement takes days and conversations; the builder must tolerate being left mid-thought and picked back up, and the draft must be invisible to every client member until published.

Out of scope here: templates (1C, one epic later, extracted from the SafeSpace shape), first-run onboarding (1D), digest cadence settings (3G; no per-engagement digest config exists in V1 and the Friday cron is global), availability or scheduling config (Ring 2 owns it).

## 2. What V1 plus 1A already has

- **`engagements.status` has a `proposed` value, and it is NOT a draft.** The client surface reads engagements with status in ('active','proposed','paused') on Home and allows booking against active and proposed. `proposed` means "visible, pre-kickoff," not "hidden." A draft state cannot ride this column without rewriting client reads and their RLS; see the design decision below.
- **Workstreams** carry title, stage (diagnose through done), sort, optional color_token, both scope ids. Stage events log every move.
- **1A provides the people machinery:** clients, invites on both walls, the designed invite email (`lib/inviteEmail.ts`), revocation, the audit and rate-limit patterns. The builder composes these, it does not duplicate them.
- **`fee_display`** exists on engagements (gate 9: shows in the charter, nowhere else; the builder captures it, nothing renders it yet).
- **The seed remains the record** of what a fully furnished engagement looks like (`seed-safespace-pilot.sql`): workstreams, homework starters, readiness notes, library content. The builder's publish creates the STRUCTURE; furnishing stays manual until templates (1C).

## 3. The design decision: a draft is not an engagement yet

The draft lives in its own practice-only table, `engagement_drafts`, and publishing births the real rows. Chosen over a status flag because:

1. **Invisibility by construction.** Client members can read engagements, workstreams, and everything downstream under RLS today. A draft flag would need a filter added to every client-side policy and every client query, and one miss is a leak. A separate table with zero client-facing policies cannot leak, and the isolation matrix can prove it in one line.
2. **Resumability wants a loose shape.** A half-scoped engagement has holes (no dates yet, workstreams still being named). The live tables enforce integrity a draft should not have to satisfy; the draft's `shape` is jsonb, validated fully only at publish.
3. **Templates fall out for free.** A 1C template is a draft shape with the client stripped; same jsonb, one more column later.

## 4. Schema delta (migration 0010)

```sql
create table engagement_drafts (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  client_id   uuid references clients(id) on delete set null,  -- nullable: pick the client mid-draft
  title       text not null default 'Untitled engagement',
  shape       jsonb not null default '{}',
  status      text not null default 'draft' check (status in ('draft','published','discarded')),
  published_engagement_id uuid references engagements(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

- **RLS: practice members only, both verbs through the existing predicates** (`is_practice_member` for read; `keystone_can(practice_id, null, 'engagement.write')` for writes). No client-facing policy of any kind. This is the documented practice-only scoped-table case: it carries `practice_id`, and `client_id` is a reference for the draft's target, never a read grant.
- `shape` holds: starts_on, length_months, fee_display, cadence_md (plain words: "twice weekly in month one, then set month by month"), workstreams `[{title, stage, sort}]`, invites `[{email}]`, notes_md (private scoping notes, practice-only forever, discarded at publish, never copied into the engagement).
- Discard is a status, not a delete, per the standing no-hard-delete rule.
- **Isolation matrix, same PR:** a client member reads zero drafts (their own client's included), a cross-practice owner reads zero, a consultant of the practice reads them, stranger and anon read zero. Static gate pins the zero-client-policy shape the same way the digests table is pinned.

## 5. The surface

**`/engagements/new` and `/engagements/drafts/[id]`** on the practice surface (owner or consultant; engagement.write is the authority, matching who scopes engagements in practice).

One page, sections stacked, every section saving on its own (server action per section, no client-side state machine, no step counter):

1. **Client.** Pick an existing client or add one inline (writes the same `clients` row 1A does). A draft can exist before its client does.
2. **Basics.** Title, start date, length in months (derives ends_on at publish), the fee line (captured for the charter, shown nowhere else, per gate 9).
3. **Workstreams.** Add, rename, reorder, remove; each with a starting stage (default diagnose). The proposal's language, verbatim, is the point: these names are client-facing from first login.
4. **Cadence.** One plain-prose field. Honest about V1: cadence is words the humans honor, not scheduling machinery; the machinery is Ring 2's availability windows.
5. **People.** The invite list: emails to invite as client members at publish. Nothing sends while drafting.
6. **Private notes.** The consultant's scoping scratchpad. Never published, never copied over, plainly labeled as such.

A drafts list lives on `/engagements` (practice surface) above the live engagements: title, client, last touched, resume link. Mobile first at 390px: the sections are already a single column; nothing new to invent.

## 6. Publish (the one transaction that matters)

Publish validates the full shape (client chosen, title, at least one workstream, dates parse), then in order:

1. Insert the `engagements` row (status **active**, per CONFIRM 1B-4 below; starts_on, ends_on derived, fee_display).
2. Insert the workstreams with their stages and sorts.
3. Insert pending `client_members` rows for the invite list (1A's insert, same duplicate handling; existing members untouched).
4. Send the invite emails through the 1A path (same rate limits, same designed artifact), unless the "publish without sending" box is ticked (CONFIRM 1B-1).
5. Mark the draft `published` with `published_engagement_id`; the draft stays as the record of what was scoped.
6. Audit one `engagements.published` entry (metadata: draft id, engagement id, counts).

Failure honesty: if invite sends fail, the engagement still exists and the UI says which emails did not go out (same contract as 1A: the row is the invite, the email is a nudge). Publish is not retried into duplicates: rerunning publish on a published draft is a no-op with an honest note.

## 7. The per-feature gate walk (SOBO_PLAYBOOK section 10)

- **New scoped table:** `engagement_drafts`, practice_id carried, membership RLS via the hardened predicates (revocation closes it automatically), isolation matrix extension in the same PR including the "client member of the SAME client reads zero drafts" case, which is the whole point of the design.
- **New routes:** practice surface, `engagement.write` resolved server-side, service role only after the check for publish (multi-table write); section saves ride the session client under RLS.
- **New person-data:** invite emails inside `shape` (minimized: email only, no names); private notes are practice-only by the table's own wall.
- **New AI surface:** none.
- **Secrets:** none.
- **Copy:** builder strings and empty states through the voice gate; no wizard-speak ("step 3 of 6" is banned by taste: sections, not steps).
- **Mobile:** 390px run of draft, resume, publish.

## 8. Build shape (one ring-style PR)

1. Migration 0010 plus matrix extension plus static gate (red, then green).
2. Drafts list on `/engagements`; `/engagements/new` creates a draft and redirects to it.
3. The draft page's six sections with per-section saves.
4. Publish action with the ordered transaction and honest failure states.
5. Typecheck, lint, full gates, scratch-Postgres matrix run, build, 390px run.

## 9. CONFIRM gates for 1B

| # | Question | Recommendation |
|---|---|---|
| 1B-1 | Does publish send the invites in the same motion? | Yes, with a visible "publish without sending invites yet" checkbox; scoping calls often end before the client has named all four people |
| 1B-2 | Can the builder add a client inline, or is 1A's members page the only door? | Inline, writing the exact same row; one motion beats two rooms |
| 1B-3 | Engagement born as `active` or `proposed` at publish? | `active`. The client surface already treats both as visible, and a published engagement with invites out IS live; `proposed` stays for a future pre-signature state if 5E ever wants it |
| 1B-4 | Do published drafts show in the drafts list? | Keep them, collapsed under "published", as the scoping record; they are the seed of 1C templates |
