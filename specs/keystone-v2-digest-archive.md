# Spec: Keystone V2 3G, the digest archive

**Parent:** `specs/keystone-v2.md` Phase 3 epic 3G, the last of the phase: a persistent in-app digest archive and per-recipient digest modes, with cadence per engagement.
**Grounded against:** the live codebase after 3E. The digest engine is whole since Ring 6: the Friday cron drafts from the week's real rows, the /today queue approves, the approval writes a `digests` row and sends one branded email per client member. What is missing is memory and reach: the client meets the digest ONLY in their inbox (`digests` has no client read by design, until now), there is no archive on either side, and the cron drafts weekly for every engagement regardless of season. Also open here: 3E deferred digest anchors "until 3G gives digests a client surface"; this epic closes that loop.
**Status:** draft for Remi. CONFIRM gates in section 7.
**Date:** 2026-07-10

---

## 1. What 3G is

The digest gets a memory. Three moves:

1. **The archive, both sides.** A client page (`/digests`) listing every SENT digest for their engagement, newest first, rendered as documents; the engagement page gets the same list for the practice. The archive shows exactly what reached inboxes: `status = 'sent'` rows only, because a record of what was sent must contain only what was sent.
2. **Cadence per engagement.** A `digest_cadence` on the engagement (weekly, the default; biweekly; off), honored by the digest cron BEFORE it drafts, so a paused engagement or a quiet season stops producing drafts you have to dismiss.
3. **The 3E loop closes.** With a client surface for digests, the `digest` anchor value joins messages: "Ask about this digest" on each archive entry, one tap into the one composer, the chip linking back to the archive.

## 2. Schema (migration 0024)

```sql
-- The archive read: a client member reads their own SENT digests.
create policy digests_client_read on public.digests
  for select to authenticated
  using (status = 'sent' and private.is_member_of_client(client_id));

alter table public.engagements
  add column digest_cadence text not null default 'weekly'
    check (digest_cadence in ('weekly','biweekly','off'));

-- 3E's deferred value joins the anchor check.
alter table public.messages drop constraint messages_anchor_type_check...;
-- rebuilt with 'digest' in the list
```

- **Approved-but-unsent digests stay practice-only**: the client read policy demands `status = 'sent'`, so a draft you approved at 9am but whose email failed is not in the client's archive claiming otherwise. No client write path of any kind; the table keeps zero session writes.
- **The cron honors cadence before drafting**: `off` skips the engagement entirely; `biweekly` skips when a digest exists for either of the last two weeks. No model call happens for a skipped engagement, so the spend guard never even wakes.
- **Per-recipient digest MODES are DEFERRED (gate 3G-2).** The V2 sketch lists buyer, coachee, digest-only, and internal-summary variants; with one client of four people, drafting two to four variants of one weekly digest is AI spend without signal. The archive and cadence are the durable substrate; modes return as their own spec when tenant two makes them real. Everyone keeps the digest email at launch (gate 3G-5): it is the heartbeat, and the archive is the record, not a replacement.
- **Isolation matrix, same PR:** a client member reads their own SENT digest and zero APPROVED ones; cross-client and cross-practice zero; session writes still impossible; the digest anchor case (a client anchors a sent digest; the label derives server-side). Static gate `digest-archive.spec.ts`.

## 3. Surfaces

**Client `/digests`:** the archive as a timeline of documents: week of, sent date, the body rendered with MarkdownLite, and "Ask about this digest" (the 3E entry point). Reached from the desktop sidebar (the Account precedent: desktop nav entry, no new mobile tab; the tab bar stays at five) and from a quiet line on Home when a digest went out this week.

**Practice (engagement page):** a Digests fold listing sent weeks (subject, sent date, expandable body), and the cadence select (weekly, biweekly, off) saved through the existing engagement update path. /today's digest queue is untouched.

**The cron (`/api/digest`):** one new early check per engagement: read `digest_cadence`, skip `off`, skip `biweekly` when the last sent digest is under two weeks old. Logged in the run summary as counts.

**Anchors:** `resolveAnchor` gains the digest case (label: "the digest for the week of {week_of}", resolved through the caller's session, which for a client only ever sees sent rows); `anchorHref` sends the client to `/digests` and the practice to the engagement page fold.

## 4. What this hands the later epics

Phase 3 closes. 5A's closeout reads the archive as the engagement's week-by-week narrative, already written. 5C's case study drafts from it. Modes, when tenant two justifies them, land on a table that already has its surfaces.

## 5. AI

No new AI. The existing digest job gains only the cadence check, which runs BEFORE any model call.

## 6. The per-feature gate walk

- No new tables; one new read policy on an already-matrixed table (asserted for both status values), one constrained column on engagements, one anchor value.
- New person-data: none; the archive is content the recipients already received by email.
- Client surface stays pure RLS (`/digests` reads through the session under the new sent-only policy); the cadence select is a practice write through the existing engagement path.
- Copy voice-swept; the archive renders history as history.
- Mobile: `/digests` is a reading page, single column at 390px; the tab bar is untouched.

## 7. CONFIRM gates for 3G

| # | Question | Recommendation |
|---|---|---|
| 3G-1 | The client archive shows SENT digests only, at /digests (desktop nav plus a Home line), tab bar untouched? | Yes. The archive is the record of what reached inboxes; an approved-but-unsent draft in it would be a small lie |
| 3G-2 | Per-recipient digest modes deferred to their own spec when tenant two makes variants real? | Yes. Four people, one digest: variants are AI spend without signal. The substrate ships now |
| 3G-3 | Cadence per engagement (weekly default, biweekly, off), honored before any model call? | Yes. A quiet season should cost nothing and queue nothing |
| 3G-4 | Digest anchors join messages now, closing the 3E deferral? | Yes. The surface exists; the dead-link objection is gone |
| 3G-5 | Everyone keeps the digest email at launch; individual digest opt-out arrives with modes? | Yes. The digest is the engagement's heartbeat; the archive is its memory, not its replacement |
