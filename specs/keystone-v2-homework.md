# Spec: Keystone V2 3C, the homework accountability loop

**Parent:** `specs/keystone-v2.md` Phase 3 epic 3C, pulled ahead of 3A on Remi's call (2026-07-10): the homework surface is the one the coachees touch most, and it needs the major upgrade first.
**Grounded against:** the live codebase after Phase 2. Today an action item is a title, a due date, and an open/done checkbox: no body, no conversation, no evidence, no send-back. The only paths that create one are the AI proposal accept and the seed; no manual add form exists anywhere (a real gap, fixed here). `action_items_read` shows every item to every client member; the check-off policy admits only your own rows. **V2-4 is already decided** (Remi, 2026-07-09, firmly): founders see completion only, never a coachee's per-item revision history, and the wall lives in the read policy, not the UI.
**Status:** BUILT 2026-07-10. All five gates approved as recommended (Remi, "recommendation approved"). Migration 0017 applied live; 3A's schema slides to 0018 with gate 3A-1 closed as transferred.
**Date:** 2026-07-10

---

## 1. What 3C is

Homework grows from a checklist into a coaching loop. Two laws:

1. **The wall (V2-4, decided, implemented here).** The working of homework, submissions, feedback, revision rounds, stuck-ness, is between the coachee and the consultant only. Teammates and buyers see that an item exists and whether it is open or done, nothing more. Susan never reads Jasmine's "needs revision" history, because a coaching loop the boss can read is a performance file.
2. **Two speeds, chosen per item.** "Read the guide before Tuesday" deserves a checkbox, not a workflow. The consultant marks an item as review work when assigning it; only then does the loop (submit, feedback, accept) replace the check-off. Friction where it coaches, none where it nags.

Reminders are DEFERRED to 4F by design: the loop ships silent, and the nudges arrive with the notifications layer instead of as one-off emails we would rip out later.

## 2. Schema (migration 0017; 3A's deltas move to 0018)

```sql
alter table action_items
  add column body_md text,
  add column review_requested boolean not null default false,
  add column audience text not null default 'client'
    check (audience in ('client','practice'));

create table homework_activity (
  id uuid primary key default gen_random_uuid(),
  action_item_id uuid not null references action_items(id) on delete cascade,
  practice_id uuid not null references practices(id),
  client_id uuid not null references clients(id),
  engagement_id uuid not null references engagements(id),
  author_client_member_id uuid references client_members(id),
  author_practice_member_id uuid references practice_members(id),
  kind text not null check (kind in
    ('comment','submission','send_back','acceptance','blocked','unblocked')),
  body_md text,
  link_url text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(author_client_member_id, author_practice_member_id) = 1)
);
```

- **`action_items.status` stays exactly `open`/`done`.** This is the wall's load-bearing trick: the granular loop state (submitted, needs revision, blocked, accepted) never sits on the item row, because every client member can read that row and RLS cannot show one column value to Aris and another to Susan. The loop state is DERIVED from the newest state-changing row in `homework_activity`, and that table is walled. Acceptance flips `status` to `done` and stamps `done_at`, so 4D/4E/2D keep reading completion as history exactly as before.
- **The audience wall (3A gate 3A-1, transferred here since 3C lands first):** `action_items_read` is rebuilt to `is_practice_member(practice_id) OR (is_member_of_client(client_id) AND audience = 'client')`. Internal practice tasks become invisible to every client member the day the column exists.
- **`homework_activity` policies:** read admits a practice member OR the caller who owns the parent item's assigned membership (an exists against `action_items` plus `owns_client_membership`; deliberately NOT `is_member_of_client`, that is the wall). Client insert is pure RLS: own parent item, self-authored, coachee kinds only (`comment`,`submission`,`blocked`,`unblocked`), parent `audience = 'client'`. Practice writes ride service-role-after-check with a mirror insert policy as depth. **Zero update and zero delete policies for every session** (the decisions discipline): a coaching record you can quietly rewrite is not a record; a bad comment is answered by the next comment.
- **Check-off tightened:** `action_items_checkoff` gains `AND review_requested = false`, so a review item cannot be self-completed; accepting is the consultant's move. Check-off items keep today's done/reopen behavior untouched.
- **Isolation matrix, same PR:** cross-practice and cross-client walls on `homework_activity`; the headline case, a SECOND member of the SAME client reads zero activity rows on a teammate's item; internal items invisible to client sessions; a review item's self-check-off updates zero rows; append-only asserted (update and delete fail for every session). Static gate `homework-isolation.spec.ts`; `homework_activity` joins the coverage ratchet.

## 3. Surfaces

**Client `/homework` (pure RLS, the coachee's phone surface, designed at 390px first):**
- **Yours** becomes cards: title, body preview, due, workstream. Opening one shows the full body (MarkdownLite), the activity thread (only yours exist under the policy anyway), a comment box, and either the Done button (check-off items, exactly today's behavior) or the submit box (a note plus an optional link) for review items. After submitting, the item reads "with the consultant"; a send-back shows the consultant's note and reopens the box; Blocked is a button with a note, cleared by unblock or the next submission.
- **The team** and **Done** stay as they are: title, who, due, open or done. Nothing else renders because nothing else is readable.
- **Home strip (2D):** your submitted items show "with the consultant" instead of nagging a due date (own-item activity is inside the wall already).

**Practice (engagement page, service-role-after-check):**
- A real Homework section: the review queue first (submitted, oldest first), then open items by assignee, internal tasks marked, done folded away. Item detail shows the thread with accept (optional note) and send back (note required), plus due/assignee edits.
- **Add homework, at last:** title, body, assignee from either roster, due, timing, workstream, the review toggle; audience defaults from the assignee's side and stays editable. Today homework is born only inside the AI accept, which is why the surface feels thin.
- **/today:** the homework card counts real submissions awaiting review (derived state), not open items.

## 4. What this hands the later epics

3A's review workspace arrives to find the audience wall built and the review toggle ready as a per-item disposition at publish time (its gate 3A-1 closes as transferred). 4B gets internal tasks already walled and visibly marked. 4D readiness and 4E health read completion history off `status` and `done_at` unchanged. 2E's Q&A and the record search need no new wall: both run on the asker's own session, so a teammate's activity rows are mechanically invisible; for now `homework_activity` stays out of both corpora entirely, the smallest honest scope.

## 5. AI

None new. Extraction-born items stay check-off by default; the consultant flips the review toggle per item until 3A makes that choice first-class at publish.

## 6. The per-feature gate walk

- New scoped table carries `practice_id` AND `client_id` (and `engagement_id`), membership RLS, and its cross-practice, cross-client, AND same-client-wall matrix cases in the same PR.
- New person-data: submission notes and feedback, minimized, on the right wall, append-only; audit stays metadata-only (counts and kinds, never note bodies); nothing here reaches a model.
- Client surface stays pure RLS end to end (comment, submit, block, check-off are session writes under policies); practice acceptance and send-back are service-role-after-check.
- Copy voice-swept; growth rendered as history, never scored: no streaks, no completion percentages, the Done list stays a plain list.
- Mobile: the coachee loop is the epic's primary 390px surface; one card per item, the thread reads as a conversation.

## 7. CONFIRM gates for 3C

V2-4 (the buyer wall) is decided and implemented as specified above; it is not reopened here.

| # | Question | Recommendation |
|---|---|---|
| 3C-1 | Two speeds per item (check-off vs review) rather than forcing submit on everything? | Yes. The checkbox stays for reading-and-doing items; the loop is opt-in per item where the work deserves eyes. The toggle stays editable until the first submission lands |
| 3C-2 | Loop state derived from the walled activity trail, never a status column on the item? | Yes. RLS is row-level: one status column cannot show "needs revision" to the coachee and "open" to the buyer. Deriving from the walled table is the only mechanical wall, and pilot row counts make it cheap |
| 3C-3 | The activity trail append-only, no edit or delete for any session? | Yes. The decisions discipline applied to coaching: the trail is the record, and corrections are new rows |
| 3C-4 | Evidence at launch: note plus link, with file attachments as a follow-up commit inside this epic? | Yes. The loop proves itself first; files then reuse the documents pattern (own bucket, path-scoped read policy extended with the same coachee wall), a mechanical second commit |
| 3C-5 | Pull 3A's audience wall (its gate 3A-1) into this PR since 3C now lands first? | Yes. The wall belongs to whichever epic touches the table first; an unwalled internal task is a leak whichever door it enters by |
