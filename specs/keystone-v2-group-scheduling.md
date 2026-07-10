# Spec: Keystone V2 3H, group scheduling (pick the next date together)

**Parent:** pilot harvest item 1 of 2026-07-10 (`CURRENT.md`), slotted into Phase 3 beside 3B run of show. Remi's words: "I control what we have available, and then they pick times that work for each of them, and then we see what works. Like a click on what's available."
**Grounded against:** Ring 2 as built. The practice already controls availability (`availability_windows`), the pure slot engine already computes offered slots (`computeSlots` in `src/lib/scheduling.ts`), booking already re-validates against `isOfferedSlot` and the DB exclusion constraint already makes double-booking impossible. What is missing is coordination: today one person books for everyone; a team of coachees has no way to converge on a date inside the app.
**Status:** BUILT 2026-07-10, same day as the spec. All five gates approved as recommended (Remi, "recommendations approved"). Migration 0018 applied live; 3A's schema slides to 0019.
**Date:** 2026-07-10

---

## 1. What 3H is

A date poll, run on rails the practice already owns. Three moves:

1. **The practice opens a poll** for an engagement by picking a handful of candidate slots FROM ITS OWN OFFERED SLOTS (the same engine that powers booking: windows minus busy, minimum notice respected). The candidates are the practice's availability by construction; nobody can propose a time the consultant cannot make.
2. **Each client member marks what works.** One tap per candidate, "works for me," unmark to change your mind. Everyone on the team sees the tally fill in, names included: coordination needs names, and knowing Tuesday fails because Jasmine is out IS the product.
3. **The practice confirms the winning slot.** Confirmation re-validates the candidate against the offered slots at that moment (stale candidates refuse honestly) and books through the existing session path, exclusion constraint and all. The poll closes pointing at the session it produced.

No AI, no reminders (4F later), no external scheduling links. Calm by design: marks are yes-only (no maybes to argue over), and one poll per engagement is open at a time, because "the next date" is singular.

## 2. Schema (the next free migration number at build time)

```sql
create table session_polls (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  purpose       text,
  slot_minutes  int not null default 60,
  status        text not null default 'open' check (status in ('open','booked','closed')),
  session_id    uuid references sessions(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
-- one open poll per engagement (partial unique index on status = 'open')

create table session_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references session_polls(id) on delete cascade,
  engagement_id uuid not null, practice_id uuid not null, client_id uuid not null,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  tz        text not null,
  sort      int not null default 0
);

create table session_poll_marks (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references session_poll_options(id) on delete cascade,
  poll_id   uuid not null references session_polls(id) on delete cascade,
  engagement_id uuid not null, practice_id uuid not null, client_id uuid not null,
  client_member_id uuid not null references client_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, client_member_id)
);
```

- **Polls and options: practice writes, both sides read.** Insert and update through `engagement.write`; the client never creates or edits a poll. Read is the standard both-dimension membership pair. No delete on polls (closing is a status, the trail stays); options delete with their poll only.
- **Marks: the one client write.** Insert demands self-authorship (`owns_client_membership(client_member_id)`), scope columns matching the parent option, and the poll still `open`. Delete admits only YOUR OWN mark (changed my mind), also only while open. No update policy. This is coordination, not a coaching record: unlike `homework_activity`, taking your mark back is honest, editing someone else's never is.
- **No practice marks** (gate 3H-3): the candidate list IS the practice's availability; a consultant marking their own offer adds noise, not signal.
- **Isolation matrix, same PR:** cross-practice and cross-client walls on all three tables; a client member of the OTHER client reads zero polls; self-authorship on marks (forging a teammate's mark is denied); deleting a teammate's mark updates zero rows; marking a closed poll is denied; a client session cannot create a poll or an option. Static gate `scheduling-poll-isolation.spec.ts`; all three tables join the coverage ratchet.

## 3. Surfaces

**Practice (engagement page, plus the confirm on the poll):**
- "Pick a date together": opening the fold shows the next offered slots (the existing engine, the booking defaults: 14 days out, 24h notice) as checkboxes; pick a few (3 to 8), an optional purpose line ("the July working call"), open the poll.
- The open poll renders as a tally: each candidate with who marked it and a count against the client roster ("2 of 4"). A **Confirm** button per candidate books it: re-validate with `isOfferedSlot` against a fresh slot computation, insert the session through the existing path (the exclusion constraint stays the last word), stamp the poll `booked` with the `session_id`. A stale candidate refuses with an honest message and stays visible. **Close without booking** is always available (status `closed`).
- Confirming does not require every mark: the tally informs the human, the human decides (gate 3H-1).

**Client (/sessions, top of the page, 390px first):**
- The open poll is a card: the purpose, the candidates in the member's own local rendering (the existing session time formatting), one tap to mark "works for me," tap again to unmark. Teammates' marks show with first names, so the team converges without a meeting about the meeting.
- Once booked, the card resolves into the normal upcoming session (which already appears on /sessions and Home); a closed poll disappears.

**No new notification paths.** The poll lives where the team already looks (/sessions, the engagement page). Nudges arrive with 4F like everything else.

## 4. What this reuses and hands forward

The slot engine, the busy-interval RPC, the booking revalidation, and the exclusion constraint are all reused untouched; the poll is a thin coordination layer with zero new time math. 3B (run of show) gets sessions that were born with team agreement; 4F gets an obvious nudge target ("two of four have marked; Thursday needs you").

## 5. AI

None.

## 6. The per-feature gate walk

- Three new scoped tables, all carrying `practice_id` AND `client_id`, membership RLS, and their cross-practice, cross-client, self-authorship, and closed-poll matrix cases in the same PR.
- New person-data: a name against a timestamp (who can make when), read-scoped to the engagement's own two sides, deletable by its owner while the poll is open. No AI touches it; audit records poll opened/booked/closed as metadata only.
- Client surface stays pure RLS (mark and unmark are session writes under the policies); poll creation and confirmation are practice moves through the session client under `engagement.write`, with the session insert riding the existing booking path.
- Copy voice-swept; the tally is a fact ("2 of 4"), never a scoreboard on people; no member is ever shown as "the one blocking."
- Mobile: the client poll card is the primary 390px surface; one candidate per row, tap targets full-width.

## 7. CONFIRM gates for 3H

| # | Question | Recommendation |
|---|---|---|
| 3H-1 | Who books the winning slot: the practice confirms, or auto-book when every member has marked? | The practice confirms. Auto-booking surprises calendars, and unanimity is not always the right bar (three of four with the founder in may be the meeting). The tally informs; the human decides |
| 3H-2 | Marks with names, or anonymous counts? | Names. This is team coordination, not coaching data; "Tuesday fails because Jasmine is out" is exactly the information the team needs, and hiding it would force the meeting-about-the-meeting this feature exists to kill |
| 3H-3 | Do practice members mark too? | No. The candidates ARE the practice's availability; only client members mark. If a second consultant's calendar matters, the candidates should be narrowed at creation, not voted on |
| 3H-4 | One open poll per engagement, enforced by the schema? | Yes, a partial unique index. "The next date" is singular; two concurrent polls are how teams end up double-booked and confused |
| 3H-5 | May a client member open a poll? | Not in this epic. The practice controls availability, so the practice opens polls; a member who wants one asks in messages. Revisit if the pilot shows real demand |
