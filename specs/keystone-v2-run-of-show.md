# Spec: Keystone V2 3B, the run of show

**Parent:** `specs/keystone-v2.md` Phase 3 epic 3B: structure per session, and the bridge between the arc and the calendar. A session's purpose should name what it moves.
**Grounded against:** the live codebase after 4F. A session today is a time, a kind, and a status; the notes page (3A's review workspace) gives the COMPLETED side its structure already (summary, decisions, items), and prep resources attach since Ring 4. What is missing is the UPCOMING side: why this session exists, what it intends to move, what to bring, and what is due before it. Also found in recon: the client's `session.book` permission can today update ANY column on their own session rows (no column grant on `sessions`); harmless while the columns are only times, a real gap the moment practice-authored fields land. This epic closes it.
**Status:** draft for Remi. CONFIRM gates in section 7.
**Date:** 2026-07-10

---

## 1. What 3B is

Every upcoming session answers four questions before anyone joins: what this session is FOR (purpose), what we will do (agenda), what it intends to move (a workstream and the stage it aims at), and what is due before it (3C homework, already queryable by session and timing). The completed side keeps 3A's structure; 3B is the front half, plus calm reschedule manners and the session's own reminder.

## 2. Schema (migration 0021)

```sql
alter table public.sessions
  add column purpose text,
  add column agenda_md text,
  add column moves_workstream_id uuid references workstreams(id) on delete set null,
  add column moves_to_stage text,
  add column reschedule_note text;

-- The wall found in recon: reschedule may touch times and its note,
-- nothing else. Practice-authored structure rides the service role
-- after the check (the documents/charter precedent).
revoke update on public.sessions from authenticated;
grant update (starts_at, ends_at, tz, status, reschedule_note)
  on public.sessions to authenticated;

-- 4F grows one kind: the session's own reminder.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (... existing ..., 'session_reminder'));
```

- **The moves line is structured, not prose** (gate 3B-1): `moves_workstream_id` plus `moves_to_stage` render as "this session moves Program Rhythm toward Build" on both surfaces, and later epics (4A's queue, 4E's momentum) read it mechanically. The purpose stays free prose for everything structure cannot say.
- **The column grant** is the load-bearing security change: a client member keeps exactly the reschedule verbs (times, status for cancel, and now a courtesy note), while purpose, agenda, and the moves line become practice-authored by construction. The practice writes them through the service role after the membership check, since the grant binds the `authenticated` role on both sides. The existing calendar-sync and booking paths are audited against the grant at build time and enumerated in the static gate.
- **No new tables**: the matrix asserts the grant (a client session updating `purpose` fails; updating times still works) and re-asserts the existing walls over the new columns. Static gate `run-of-show.spec.ts`.

## 3. Surfaces

**Practice (the session notes page, above the transcript):**
- A "Run of show" fold: purpose (one line), agenda (the MarkdownEditor), the moves pair (workstream select plus stage select from the practice's stage config), all saved by one action (service-role-after-check, voice-swept).
- Due before this session: the 3C items with this `session_id` and `before_session` timing, linked, with their loop chips.

**Client (/sessions and the session detail):**
- Each upcoming session on /sessions shows its purpose line under the time; the detail page renders purpose, the agenda (MarkdownLite), the moves line in plain words, prep (already there), and "due before this session" linking into /homework.
- **Reschedule manners:** the existing reschedule flow gains an optional one-line reason (stored in `reschedule_note`, shown to the practice on the notes page and in the practice's 4F row). The minimum-notice rule already holds mechanically: reschedules only ever land on offered slots, which respect the lead time.
- **Homework dates move with the session** (gate 3B-2): when a session moves, its `before_session` and `after_session` items shift `due_on` by the same day delta, audited as metadata. A date that silently stops matching its session is a trap; a date that moves with it is what everyone meant.

**The reminder (rides 4F):** the daily cron gains one pass: sessions starting tomorrow notify both sides' members (`session_reminder`, dedupe-keyed per session per person, one touch ever). The purpose line IS the reminder title when set: "Tomorrow: this session moves Program Rhythm toward Build" beats "You have a meeting."

## 4. What this hands the later epics

4A's queue gets "session prep needed" as a real query (upcoming sessions missing purpose or agenda). 4E reads the moves line against what actually moved. 3G's digest can say what the week's sessions were for. The stall detector on /today keeps working unchanged.

## 5. AI

None new. (A later nicety could draft an agenda from the workstream state through the proposals path; not in this epic.)

## 6. The per-feature gate walk

- No new tables; new columns on an already-matrixed table with the grant asserted in the matrix and the walls re-asserted; the static gate pins the grant's column list.
- New person-data: a reschedule reason, one line, both-sides-readable by the existing session read policy; minimized, never in logs.
- Client surface stays pure RLS (reschedule and its note ride the session client under the tightened grant); the run-of-show write is service-role-after-check.
- Copy voice-swept; the reminder is one touch, inside the 4F batch, never a ping.
- Mobile: the purpose line on /sessions at 390px is the epic's felt surface; the agenda folds.

## 7. CONFIRM gates for 3B

| # | Question | Recommendation |
|---|---|---|
| 3B-1 | The moves line as structured fields (workstream plus stage), not free prose? | Yes. "What this session moves" should be readable by machines later (4A, 4E) and by humans now; prose lives in purpose |
| 3B-2 | Rescheduling shifts linked before/after homework due dates by the same delta, audited? | Yes. The dates meant "relative to the session"; keeping that true automatically is honest, and the audit trail says what moved |
| 3B-3 | An attendees model now? | No. Every member sees every session and the teams are four people; an attendee matrix is ceremony. Revisit at tenant two |
| 3B-4 | Session reminders join the 4F cron as one dedupe-keyed touch the day before, to both sides? | Yes. It is the single most-wanted reminder in any calendar tool, and the batch keeps it calm |
| 3B-5 | "Decisions targeted" as structure? | No; a prose line inside the agenda. A decision is not real until it is decided; 2B logs it after, through 3A's workspace |
